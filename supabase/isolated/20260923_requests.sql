-- Apply this file explicitly, NOT db push (older migrations are not approved).
-- Only kitty_staging objects plus one new service-only RPC in public.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create schema kitty_staging;
revoke all on schema kitty_staging from public, anon, authenticated;

create table kitty_staging.requests (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null,
 client_id uuid not null,
 kind text not null check(kind in ('leave','correction')),
 work_date date not null,
 leave_type text,
 duration text,
 required_net_minutes integer,
 requested_event_type text,
 requested_event_at timestamptz,
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
 approved_sequence_in_month integer,
 deduction_amount integer not null default 0,
 reviewed_by uuid,
 review_reason text,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 unique(employee_id,client_id),
 check ((kind='leave' and duration in ('FULL_DAY','HALF_DAY_AM','HALF_DAY_PM')
   and leave_type in ('ลากิจ','ลาป่วย','ลาพักร้อน','ลาไม่รับค่าจ้าง')
   and required_net_minutes=case when duration='FULL_DAY' then 0 else 240 end
   and requested_event_type is null and requested_event_at is null)
 or (kind='correction' and requested_event_type in ('IN','BREAK_OUT','BREAK_IN','OUT')
   and requested_event_at is not null and duration is null and leave_type is null and required_net_minutes is null)),
 check ((status='APPROVED' and kind='correction' and approved_sequence_in_month>0
   and deduction_amount=case when approved_sequence_in_month>=3 then 200 else 0 end)
   or ((status<>'APPROVED' or kind<>'correction') and approved_sequence_in_month is null and deduction_amount=0))
);
create index on kitty_staging.requests(employee_id,work_date);
create index on kitty_staging.requests(status,created_at desc);
create unique index pending_correction on kitty_staging.requests(employee_id,work_date,requested_event_type) where kind='correction' and status='PENDING';
create unique index pending_leave on kitty_staging.requests(employee_id,work_date,duration) where kind='leave' and status='PENDING';
create table kitty_staging.request_audit (
 id bigint generated always as identity primary key,
 request_id uuid not null references kitty_staging.requests(id),
 actor_line_user_id text not null,
 action text not null,
 created_at timestamptz not null default now()
);
alter table kitty_staging.requests enable row level security;
alter table kitty_staging.request_audit enable row level security;
revoke all on all tables in schema kitty_staging from public,anon,authenticated;
revoke all on all sequences in schema kitty_staging from public,anon,authenticated;

create function public.kitty_staging_request_v1(actor text, operation text, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $fn$
declare
 emp public.employees%rowtype;
 manager public.admins%rowtype;
 target public.employees%rowtype;
 req kitty_staging.requests%rowtype;
 current_req kitty_staging.requests%rowtype;
 is_hr boolean;
 request_date date;
 event_time timestamptz;
 client uuid;
 seq integer;
 result jsonb;
 today date := (now() at time zone 'Asia/Bangkok')::date;
begin
 if actor is null or length(actor)=0 then raise exception 'UNAUTHENTICATED'; end if;
 if (select count(*) from public.employees where line_user_id=actor and active)>1
   or (select count(*) from public.admins where line_user_id=actor and active)>1 then raise exception 'AMBIGUOUS_IDENTITY'; end if;
 select * into emp from public.employees where line_user_id=actor and active;
 select * into manager from public.admins where line_user_id=actor and active;
 if emp.id is null and manager.id is null then raise exception 'FORBIDDEN'; end if;
 is_hr := upper(coalesce(manager.role,''))='HR' or (manager.id is not null and coalesce(payload->>'previewRole','')='HR');

 if operation='submit' then
   if emp.id is null then raise exception 'EMPLOYEE_REQUIRED'; end if;
   if coalesce(payload->>'kind','') not in ('leave','correction')
     or length(btrim(coalesce(payload->>'reason',''))) not between 1 and 1000
     or coalesce(payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(payload->>'clientId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_REQUEST'; end if;
   request_date := (payload->>'date')::date;
   client := (payload->>'clientId')::uuid;
   if request_date < date '2000-01-01' or request_date > today+366 then raise exception 'INVALID_DATE'; end if;
   if payload->>'kind'='leave' then
     if coalesce(payload->>'duration','') not in ('FULL_DAY','HALF_DAY_AM','HALF_DAY_PM')
       or coalesce(payload->>'type','') not in ('ลากิจ','ลาป่วย','ลาพักร้อน','ลาไม่รับค่าจ้าง') then raise exception 'INVALID_LEAVE'; end if;
   else
     if request_date>today or coalesce(payload->>'event','') not in ('IN','BREAK_OUT','BREAK_IN','OUT')
       or coalesce(payload->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'INVALID_EVENT'; end if;
     event_time := (request_date+(payload->>'time')::time) at time zone 'Asia/Bangkok';
     if event_time>now() then raise exception 'FUTURE_EVENT'; end if;
   end if;
   -- Same employee submissions and decisions serialize before reading counts.
   perform pg_advisory_xact_lock(hashtextextended('kitty-staging:'||emp.id::text,0));
   select * into req from kitty_staging.requests where employee_id=emp.id and client_id=client;
   if req.id is not null then
     if req.kind<>payload->>'kind' or req.work_date<>request_date or req.reason<>btrim(payload->>'reason')
       or (req.kind='leave' and (req.duration<>payload->>'duration' or req.leave_type<>payload->>'type'))
       or (req.kind='correction' and (req.requested_event_type<>payload->>'event' or req.requested_event_at<>event_time)) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
     return jsonb_build_object('ok',true,'request',to_jsonb(req),'replayed',true,'sandbox',true);
   end if;
   insert into kitty_staging.requests(employee_id,client_id,kind,work_date,leave_type,duration,required_net_minutes,requested_event_type,requested_event_at,reason)
   values(emp.id,client,payload->>'kind',request_date,
     case when payload->>'kind'='leave' then payload->>'type' end,
     case when payload->>'kind'='leave' then payload->>'duration' end,
     case when payload->>'kind'='leave' then case when payload->>'duration'='FULL_DAY' then 0 else 240 end end,
     case when payload->>'kind'='correction' then payload->>'event' end,event_time,btrim(payload->>'reason')) returning * into req;
   insert into kitty_staging.request_audit(request_id,actor_line_user_id,action) values(req.id,actor,'SUBMIT');
   return jsonb_build_object('ok',true,'request',to_jsonb(req),'sandbox',true);
 end if;

 if operation in ('review','cancel') then
   select * into req from kitty_staging.requests where id=(payload->>'id')::uuid;
   if req.id is null then raise exception 'NOT_FOUND'; end if;
   if operation='cancel' then
     if emp.id is null or emp.id<>req.employee_id then raise exception 'FORBIDDEN'; end if;
   else
     if manager.id is null then raise exception 'FORBIDDEN'; end if;
     select * into target from public.employees where id=req.employee_id;
     if is_hr and (target.id is null or coalesce(target.employee_code,'') !~* '^HO'
       or upper(coalesce(target.attendance_mode::text,'')) in ('MULTI_BRANCH','DRIVER')) then raise exception 'FORBIDDEN'; end if;
     if coalesce(payload->>'decision','') not in ('APPROVED','REJECTED') then raise exception 'INVALID_DECISION'; end if;
     if payload->>'decision'='REJECTED' and length(btrim(coalesce(payload->>'reviewReason','')))=0 then raise exception 'REJECTION_REASON_REQUIRED'; end if;
   end if;
   if length(coalesce(payload->>'reviewReason',''))>1000 then raise exception 'INVALID_REASON'; end if;
   perform pg_advisory_xact_lock(hashtextextended('kitty-staging:'||req.employee_id::text,0));
   select * into current_req from kitty_staging.requests where id=req.id for update;
   if current_req.status<>'PENDING' then
     if (operation='cancel' and current_req.status='CANCELLED')
       or (operation='review' and current_req.status=payload->>'decision') then
       return jsonb_build_object('ok',true,'request',to_jsonb(current_req),'replayed',true,'sandbox',true);
     end if;
     raise exception 'ALREADY_REVIEWED';
   end if;
   if operation='review' and payload->>'decision'='APPROVED' and req.kind='correction' then
     select count(*)+1 into seq from kitty_staging.requests
       where employee_id=req.employee_id and kind='correction' and status='APPROVED'
       and work_date>=date_trunc('month',req.work_date)::date
       and work_date<(date_trunc('month',req.work_date)+interval '1 month')::date;
   end if;
   update kitty_staging.requests set
     status=case when operation='cancel' then 'CANCELLED' else payload->>'decision' end,
     reviewed_by=case when operation='review' then manager.id end,
     review_reason=nullif(btrim(payload->>'reviewReason'),''),
     reviewed_at=now(),approved_sequence_in_month=seq,deduction_amount=case when seq>=3 then 200 else 0 end
   where id=req.id returning * into req;
   insert into kitty_staging.request_audit(request_id,actor_line_user_id,action) values(req.id,actor,req.status);
   return jsonb_build_object('ok',true,'request',to_jsonb(req),'sandbox',true);
 end if;

 if operation not in ('mine','queue','report') then raise exception 'INVALID_OPERATION'; end if;
 if operation='mine' and emp.id is null then raise exception 'EMPLOYEE_REQUIRED'; end if;
 if operation in ('queue','report') and manager.id is null then raise exception 'FORBIDDEN'; end if;
 if operation='report' and (coalesce(payload->>'month','') !~ '^\d{4}-(0[1-9]|1[0-2])$' or coalesce(payload->>'employeeId','')='') then raise exception 'INVALID_REPORT'; end if;
 if operation='report' then
   select * into target from public.employees where id=(payload->>'employeeId')::uuid;
   if target.id is null then raise exception 'NOT_FOUND'; end if;
   if is_hr and (coalesce(target.employee_code,'') !~* '^HO' or upper(coalesce(target.attendance_mode::text,'')) in ('MULTI_BRANCH','DRIVER')
     or coalesce(target.name,'') ~* '\m(shane|peet)\M') then raise exception 'FORBIDDEN'; end if;
 end if;
 select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) into result from (
   select r.created_at,to_jsonb(r)||jsonb_build_object(
     'leave_date',case when r.kind='leave' then r.work_date end,
     'employee',jsonb_build_object('id',e.id,'employee_code',e.employee_code,'name',e.name),
     'sandbox',true) as item
   from kitty_staging.requests r join public.employees e on e.id=r.employee_id
   where (operation<>'mine' or r.employee_id=emp.id)
     and (operation<>'queue' or r.status='PENDING')
     and (operation<>'report' or (r.employee_id=(payload->>'employeeId')::uuid and r.work_date>=((payload->>'month')||'-01')::date
       and r.work_date<(((payload->>'month')||'-01')::date+interval '1 month')::date))
     and (operation='mine' or not is_hr or (e.employee_code ~* '^HO' and upper(coalesce(e.attendance_mode::text,'')) not in ('MULTI_BRANCH','DRIVER')))
   order by r.created_at desc limit 1000
 ) scoped;
 return jsonb_build_object('ok',true,'rows',result,'warnings','[]'::jsonb,'sandbox',true,'limit',1000);
end;
$fn$;
revoke all on function public.kitty_staging_request_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_staging_request_v1(text,text,jsonb) to service_role;
comment on schema kitty_staging is 'Kitty Attendance isolated request testing; never updates production attendance.';
notify pgrst, 'reload schema';
commit;
