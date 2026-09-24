-- Isolated OT requests only. No production table changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table kitty_staging.overtime_requests(
 id uuid primary key default gen_random_uuid(), employee_id uuid not null, client_id uuid not null,
 mode text not null check(mode in ('USE_PRIOR','MAKEUP_NEXT')),
 work_date date not null,source_date date not null,target_date date not null check(target_date>source_date),
 minutes integer not null check(minutes between 1 and 1440),
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
 reviewed_by uuid,review_reason text,created_at timestamptz not null default now(),reviewed_at timestamptz,
 unique(employee_id,client_id)
);
create index on kitty_staging.overtime_requests(employee_id,source_date,target_date,status);
create table kitty_staging.overtime_audit(
 id bigint generated always as identity primary key,request_id uuid not null references kitty_staging.overtime_requests(id),
 actor_line_user_id text not null,action text not null,created_at timestamptz not null default now()
);
alter table kitty_staging.overtime_requests enable row level security;
alter table kitty_staging.overtime_audit enable row level security;
revoke all on kitty_staging.overtime_requests,kitty_staging.overtime_audit from public,anon,authenticated;
revoke all on all sequences in schema kitty_staging from public,anon,authenticated;

create function kitty_staging.ot_balance(employee uuid,mode text,workday date,excluding uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare source_day date;target_day date;required numeric;paid numeric;finished timestamptz;available integer;reserved integer;short_left integer;
begin
 if mode not in ('USE_PRIOR','MAKEUP_NEXT') or mode is null then raise exception 'INVALID_OT_MODE'; end if;
 if not exists(select 1 from public.employee_schedules s where s.employee_id=employee and s.work_date=workday
   and s.required_hours>0 and s.schedule_status::text in ('WORK','WFH')) then raise exception 'OT_SCHEDULE_REQUIRED'; end if;
 if mode='USE_PRIOR' then
   target_day:=workday;
   select max(work_date) into source_day from public.employee_schedules where employee_id=employee and work_date<workday and required_hours>0 and schedule_status::text in ('WORK','WFH');
 else
   source_day:=workday;
   select min(work_date) into target_day from public.employee_schedules where employee_id=employee and work_date>workday and required_hours>0 and schedule_status::text in ('WORK','WFH');
 end if;
 if source_day is null or target_day is null then raise exception 'OT_SCHEDULE_REQUIRED'; end if;
 -- Missing intervening schedules are unknown, not assumed holidays.
 if exists(select 1 from generate_series(source_day+1,target_day-1,interval '1 day') d
   where not exists(select 1 from public.employee_schedules s where s.employee_id=employee and s.work_date=d::date)) then raise exception 'OT_SCHEDULE_REQUIRED'; end if;
 select s.required_hours,d.paid_work_hours,d.last_out_at into required,paid,finished
 from public.employee_schedules s left join public.daily_attendance d on d.employee_id=s.employee_id and d.work_date=s.work_date
 where s.employee_id=employee and s.work_date=source_day;
 if finished is null or paid is null or required is null then raise exception 'OT_SOURCE_NOT_FINAL'; end if;
 available:=greatest(0,floor((case when mode='USE_PRIOR' then paid-required else required-paid end)*60)::integer);
 select coalesce(sum(r.minutes),0)::integer into reserved from kitty_staging.overtime_requests r
 where r.employee_id=employee and r.status in ('PENDING','APPROVED') and (excluding is null or r.id<>excluding)
   and ((r.source_date=source_day and r.mode=ot_balance.mode)
     or (r.target_date=source_day and r.mode<>ot_balance.mode));
 available:=greatest(0,available-reserved);
 if mode='USE_PRIOR' then
   select s.required_hours,d.paid_work_hours,d.last_out_at into required,paid,finished
   from public.employee_schedules s left join public.daily_attendance d on d.employee_id=s.employee_id and d.work_date=s.work_date
   where s.employee_id=employee and s.work_date=target_day;
   if finished is not null and paid is not null then
     short_left:=greatest(0,floor((required-paid)*60)::integer);
     select coalesce(sum(r.minutes),0)::integer into reserved from kitty_staging.overtime_requests r
     where r.employee_id=employee and r.status in ('PENDING','APPROVED') and (excluding is null or r.id<>excluding)
       and ((r.source_date=target_day and r.mode='MAKEUP_NEXT') or (r.target_date=target_day and r.mode='USE_PRIOR'));
     available:=least(available,greatest(0,short_left-reserved));
   end if;
 end if;
 return jsonb_build_object('source_date',source_day,'target_date',target_day,'available_minutes',available);
end;$f$;
revoke all on function kitty_staging.ot_balance(uuid,text,date,uuid) from public,anon,authenticated;

create function public.kitty_staging_overtime_v1(actor text,operation text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare emp public.employees%rowtype;manager public.admins%rowtype;target public.employees%rowtype;
 r kitty_staging.overtime_requests%rowtype;balance jsonb;result jsonb;is_hr boolean;date_value date;amount integer;client uuid;
begin
 if actor is null or actor='' then raise exception 'UNAUTHENTICATED'; end if;
 if (select count(*) from public.employees where line_user_id=actor and active)>1
   or (select count(*) from public.admins where line_user_id=actor and active)>1 then raise exception 'AMBIGUOUS_IDENTITY'; end if;
 select * into emp from public.employees where line_user_id=actor and active;
 select * into manager from public.admins where line_user_id=actor and active;
 if emp.id is null and manager.id is null then raise exception 'FORBIDDEN'; end if;
 is_hr:=upper(coalesce(manager.role,''))='HR' or (manager.id is not null and coalesce(payload->>'previewRole','')='HR');
 if operation in ('submit','balance') then
   if emp.id is null then raise exception 'EMPLOYEE_REQUIRED'; end if;
   if coalesce(payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'INVALID_DATE'; end if;
   date_value:=(payload->>'date')::date;
   if operation='submit' then
     if coalesce(payload->>'minutes','') !~ '^[0-9]{1,4}$' or length(btrim(coalesce(payload->>'reason',''))) not between 1 and 1000 then raise exception 'INVALID_REQUEST'; end if;
     amount:=(payload->>'minutes')::integer;client:=(payload->>'clientId')::uuid;
     if client is null or amount<1 or amount>1440 then raise exception 'INVALID_REQUEST'; end if;
   end if;
   perform pg_advisory_xact_lock(hashtextextended('kitty-ot:'||emp.id::text,0));
   if operation='submit' then
     select * into r from kitty_staging.overtime_requests where employee_id=emp.id and client_id=client;
     if r.id is not null then
       if r.mode<>payload->>'mode' or r.work_date<>date_value or r.minutes<>amount or r.reason<>btrim(payload->>'reason') then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
       return jsonb_build_object('ok',true,'request',to_jsonb(r),'replayed',true,'sandbox',true);
     end if;
   end if;
   balance:=kitty_staging.ot_balance(emp.id,payload->>'mode',date_value);
   if operation='balance' then return balance||jsonb_build_object('ok',true,'sandbox',true); end if;
   if date_value>(now() at time zone 'Asia/Bangkok')::date
     or (balance->>'target_date')::date<(now() at time zone 'Asia/Bangkok')::date then raise exception 'OT_WINDOW_EXPIRED'; end if;
   if amount>(balance->>'available_minutes')::integer then raise exception 'OT_INSUFFICIENT_MINUTES'; end if;
   insert into kitty_staging.overtime_requests(employee_id,client_id,mode,work_date,source_date,target_date,minutes,reason)
   values(emp.id,client,payload->>'mode',date_value,(balance->>'source_date')::date,(balance->>'target_date')::date,amount,btrim(payload->>'reason')) returning * into r;
   insert into kitty_staging.overtime_audit(request_id,actor_line_user_id,action) values(r.id,actor,'SUBMIT');
   return jsonb_build_object('ok',true,'request',to_jsonb(r),'sandbox',true);
 end if;
 if operation in ('review','cancel') then
   select * into r from kitty_staging.overtime_requests where id=(payload->>'id')::uuid;
   if r.id is null then raise exception 'NOT_FOUND'; end if;
   if operation='cancel' then
     if emp.id is null or emp.id<>r.employee_id then raise exception 'FORBIDDEN'; end if;
   else
     if manager.id is null then raise exception 'FORBIDDEN'; end if;
     select * into target from public.employees where id=r.employee_id;
     if is_hr and (target.id is null or coalesce(target.employee_code,'') !~* '^HO' or upper(coalesce(target.attendance_mode::text,'')) in ('MULTI_BRANCH','DRIVER')) then raise exception 'FORBIDDEN'; end if;
     if coalesce(payload->>'decision','') not in ('APPROVED','REJECTED') then raise exception 'INVALID_DECISION'; end if;
     if payload->>'decision'='REJECTED' and length(btrim(coalesce(payload->>'reviewReason','')))=0 then raise exception 'REJECTION_REASON_REQUIRED'; end if;
   end if;
   if length(coalesce(payload->>'reviewReason',''))>1000 then raise exception 'INVALID_REASON'; end if;
   perform pg_advisory_xact_lock(hashtextextended('kitty-ot:'||r.employee_id::text,0));
   select * into r from kitty_staging.overtime_requests where id=r.id for update;
   if r.status<>'PENDING' then
     if (operation='cancel' and r.status='CANCELLED') or (operation='review' and r.status=payload->>'decision') then return jsonb_build_object('ok',true,'request',to_jsonb(r),'replayed',true,'sandbox',true); end if;
     raise exception 'ALREADY_REVIEWED';
   end if;
   if operation='review' and payload->>'decision'='APPROVED' then
     balance:=kitty_staging.ot_balance(r.employee_id,r.mode,r.work_date,r.id);
     if (balance->>'source_date')::date<>r.source_date or (balance->>'target_date')::date<>r.target_date then raise exception 'OT_SCHEDULE_CHANGED'; end if;
     if r.minutes>(balance->>'available_minutes')::integer then raise exception 'OT_INSUFFICIENT_MINUTES'; end if;
   end if;
   update kitty_staging.overtime_requests set status=case when operation='cancel' then 'CANCELLED' else payload->>'decision' end,
     reviewed_by=case when operation='review' then manager.id end,review_reason=nullif(btrim(payload->>'reviewReason'),''),
     reviewed_at=now() where id=r.id returning * into r;
   insert into kitty_staging.overtime_audit(request_id,actor_line_user_id,action) values(r.id,actor,r.status);
   return jsonb_build_object('ok',true,'request',to_jsonb(r),'sandbox',true);
 end if;
 if operation not in ('queue','mine','report') then raise exception 'INVALID_OPERATION'; end if;
 if operation='mine' and emp.id is null then raise exception 'EMPLOYEE_REQUIRED'; end if;
 if operation in ('queue','report') and manager.id is null then raise exception 'FORBIDDEN'; end if;
 if operation='report' then
   if coalesce(payload->>'month','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_REPORT'; end if;
   select * into target from public.employees where id=(payload->>'employeeId')::uuid;
   if target.id is null then raise exception 'NOT_FOUND'; end if;
   if is_hr and (coalesce(target.employee_code,'') !~* '^HO' or upper(coalesce(target.attendance_mode::text,'')) in ('MULTI_BRANCH','DRIVER') or coalesce(target.name,'') ~* '\m(shane|peet)\M') then raise exception 'FORBIDDEN'; end if;
 end if;
 select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) into result from(
   select q.created_at,to_jsonb(q)||jsonb_build_object('kind','overtime','sandbox',true,'employee',jsonb_build_object('id',e.id,'employee_code',e.employee_code,'name',e.name)) item
   from kitty_staging.overtime_requests q join public.employees e on e.id=q.employee_id
   where (operation<>'mine' or q.employee_id=emp.id) and (operation<>'queue' or q.status='PENDING')
   and (operation<>'report' or (q.employee_id=target.id and to_char(q.work_date,'YYYY-MM')=payload->>'month'))
   and (operation='mine' or not is_hr or (e.employee_code ~* '^HO' and upper(coalesce(e.attendance_mode::text,'')) not in ('MULTI_BRANCH','DRIVER')))
   order by q.created_at desc limit 1000
 ) x;
 return jsonb_build_object('ok',true,'rows',result,'warnings','[]'::jsonb,'sandbox',true);
end;$f$;
revoke all on function public.kitty_staging_overtime_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_staging_overtime_v1(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
