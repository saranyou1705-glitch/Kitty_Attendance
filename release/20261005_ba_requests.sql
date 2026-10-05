begin;
set local lock_timeout='5s';
alter table kitty_live.requests add column requested_office_id uuid references public.offices(id);
alter table kitty_live.requests add column requested_office_name text;
do $migration$
declare c record;
begin
 for c in select conname from pg_constraint where conrelid='kitty_live.requests'::regclass and contype='c' and pg_get_constraintdef(oid) like '%requested_event_type%' loop
  execute format('alter table kitty_live.requests drop constraint %I',c.conname);
 end loop;
end;$migration$;
alter table kitty_live.requests add constraint request_kind_fields check (
 (kind='leave' and duration in ('FULL_DAY','HALF_DAY_AM','HALF_DAY_PM') and leave_type in ('ลากิจ','ลาป่วย','ลาพักร้อน','ลาไม่รับค่าจ้าง')
 and required_net_minutes=case when duration='FULL_DAY' then 0 else 240 end and requested_event_type is null and requested_event_at is null)
 or (kind='correction' and requested_event_type in ('IN','OUT','BREAK_OUT','BREAK_IN','DAY_IN','DAY_OUT','BRANCH_IN','BRANCH_OUT')
 and requested_event_at is not null and duration is null and leave_type is null and required_net_minutes is null));
-- Keep the deployed standard/leave implementation intact, including its access checks.
alter function public.kitty_live_request_v1(text,text,jsonb) rename to kitty_live_request_core_20261005;
revoke all on function public.kitty_live_request_core_20261005(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.kitty_live_request_v1(actor text,operation text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare emp public.employees%rowtype; req kitty_live.requests%rowtype; manager uuid; new_event public.attendance_events%rowtype;
 d date; at_time timestamptz; office uuid; office_name text; seq integer; ev record; previous text; open_office uuid; inserted uuid;
begin
 if actor is null or actor='' then raise exception 'UNAUTHENTICATED';end if;
 if (select count(*) from public.employees where line_user_id=actor and active)>1 then raise exception 'AMBIGUOUS_IDENTITY';end if;
 select * into emp from public.employees where line_user_id=actor and active;
 if operation='ba_offices' then
  if emp.id is null or emp.attendance_mode::text<>'MULTI_BRANCH' then raise exception 'FORBIDDEN';end if;
  return jsonb_build_object('ok',true,'offices',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') from public.offices where active));
 end if;
 if operation='submit' and emp.attendance_mode::text='MULTI_BRANCH' and payload->>'kind'='correction' then
  if payload-array['kind','date','event','time','reason','clientId','officeId','previewRole']<>'{}'::jsonb then raise exception 'INVALID_FIELDS';end if;
  if coalesce(payload->>'event','') not in ('DAY_IN','BRANCH_IN','BREAK_OUT','BREAK_IN','BRANCH_OUT','DAY_OUT')
   or coalesce(payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(payload->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or length(btrim(coalesce(payload->>'reason',''))) not between 1 and 1000
   or coalesce(payload->>'clientId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_REQUEST';end if;
  d:=(payload->>'date')::date;at_time:=(d+(payload->>'time')::time) at time zone 'Asia/Bangkok';
  if d<date '2000-01-01' or at_time>now() then raise exception 'INVALID_DATE';end if;
  if payload->>'event' not in ('DAY_IN','DAY_OUT') then
   office:=nullif(payload->>'officeId','')::uuid;
   select name into office_name from public.offices where id=office and active;
   if office_name is null then raise exception 'OFFICE_REQUIRED';end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('kitty-live:'||emp.id::text,0));
  select * into req from kitty_live.requests where employee_id=emp.id and client_id=(payload->>'clientId')::uuid;
  if req.id is not null then
   if req.kind<>'correction' or req.work_date<>d or req.requested_event_type<>payload->>'event' or req.requested_event_at<>at_time
    or req.requested_office_id is distinct from office or req.reason<>btrim(payload->>'reason') then raise exception 'IDEMPOTENCY_CONFLICT';end if;
   return jsonb_build_object('ok',true,'request',to_jsonb(req),'replayed',true);
  end if;
  if exists(select 1 from kitty_live.requests where employee_id=emp.id and work_date=d and requested_event_type=payload->>'event' and status='PENDING') then raise exception 'DUPLICATE_PENDING_REQUEST';end if;
  insert into kitty_live.requests(employee_id,client_id,kind,work_date,requested_event_type,requested_event_at,reason,requested_office_id,requested_office_name)
   values(emp.id,(payload->>'clientId')::uuid,'correction',d,payload->>'event',at_time,btrim(payload->>'reason'),office,office_name) returning * into req;
  insert into kitty_live.request_audit(request_id,actor_line_user_id,action) values(req.id,actor,'SUBMIT');
  return jsonb_build_object('ok',true,'request',to_jsonb(req));
 end if;
 if operation='review' and payload->>'decision'='APPROVED' then
  select * into req from kitty_live.requests where id=(payload->>'id')::uuid;
  select * into emp from public.employees where id=req.employee_id;
  if req.kind='correction' and emp.attendance_mode::text='MULTI_BRANCH' then
   if payload->>'previewRole'='HR' then raise exception 'ADMIN_REQUIRED';end if;
   if (select count(*) from public.admins where line_user_id=actor and active)<>1 then raise exception 'ADMIN_REQUIRED';end if;
   select id into manager from public.admins where line_user_id=actor and active and upper(role)='ADMIN';
   if manager is null then raise exception 'ADMIN_REQUIRED';end if;
   if not emp.active then raise exception 'EMPLOYEE_INACTIVE';end if;
   perform pg_advisory_xact_lock(hashtextextended('kitty-live:'||emp.id::text,0));
   select * into req from kitty_live.requests where id=req.id for update;
   if req.status='APPROVED' then return jsonb_build_object('ok',true,'request',to_jsonb(req),'replayed',true);end if;
   if req.status<>'PENDING' then raise exception 'ALREADY_REVIEWED';end if;
   if req.requested_event_type not in ('DAY_IN','BRANCH_IN','BREAK_OUT','BREAK_IN','BRANCH_OUT','DAY_OUT') then raise exception 'INVALID_EVENT';end if;
   if exists(select 1 from public.attendance_events where employee_id=emp.id and work_date=req.work_date and event_at=req.requested_event_at) then raise exception 'EVENT_ALREADY_EXISTS';end if;
   if req.requested_event_type not in ('DAY_IN','DAY_OUT') and not exists(select 1 from public.offices where id=req.requested_office_id and active) then raise exception 'OFFICE_REQUIRED';end if;
   -- Validate the entire merged sequence, including repeated visits and branch identity.
   for ev in select * from (
    select event_type::text as kind,event_at,office_id from public.attendance_events where employee_id=emp.id and work_date=req.work_date
    union all select req.requested_event_type,req.requested_event_at,req.requested_office_id
   ) x order by event_at loop
    if not coalesce(((previous is null and ev.kind='DAY_IN')
     or (previous in ('DAY_IN','BRANCH_OUT') and ev.kind in ('BRANCH_IN','DAY_OUT'))
     or (previous in ('BRANCH_IN','BREAK_IN') and ev.kind in ('BREAK_OUT','BRANCH_OUT'))
     or (previous='BREAK_OUT' and ev.kind='BREAK_IN')),false) then raise exception 'INVALID_EVENT_ORDER';end if;
    if ev.kind='BRANCH_IN' then
     if ev.office_id is null then raise exception 'OFFICE_REQUIRED';end if;open_office:=ev.office_id;
    elsif ev.kind in ('BREAK_OUT','BREAK_IN','BRANCH_OUT') then
     if ev.office_id is distinct from open_office then raise exception 'BA_BRANCH_MISMATCH';end if;
     if ev.kind='BRANCH_OUT' then open_office:=null;end if;
    end if;
    previous:=ev.kind;
   end loop;
   new_event.event_type:=req.requested_event_type;
   insert into public.attendance_events(employee_id,work_date,event_type,event_at,attendance_mode,office_id,office_name_snapshot,source,edited_by_line_user_id,edited_at,metadata)
   values(emp.id,req.work_date,new_event.event_type,req.requested_event_at,emp.attendance_mode,req.requested_office_id,req.requested_office_name,'APPROVED_REQUEST',actor,now(),jsonb_build_object('request_id',req.id,'reason',req.reason)) returning id into inserted;
   select count(*)+1 into seq from kitty_live.requests where employee_id=emp.id and kind='correction' and status='APPROVED' and date_trunc('month',work_date)=date_trunc('month',req.work_date);
   update kitty_live.requests set status='APPROVED',reviewed_by=manager,reviewed_at=now(),approved_sequence_in_month=seq,deduction_amount=0 where id=req.id returning * into req;
   insert into kitty_live.request_effects(request_id,event_id) values(req.id,inserted);
   insert into kitty_live.request_audit(request_id,actor_line_user_id,action) values(req.id,actor,'APPROVED');
   perform public.recalculate_daily(emp.id,req.work_date);
   return jsonb_build_object('ok',true,'request',to_jsonb(req));
  end if;
 end if;
 return public.kitty_live_request_core_20261005(actor,operation,payload);
end;$f$;
revoke all on function public.kitty_live_request_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_live_request_v1(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
