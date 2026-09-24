begin;
create schema kitty_req_source;
create schema kitty_req_fixture;
create table kitty_req_source.employees(like public.employees including all);
create table kitty_req_source.admins(like public.admins including all);
create table kitty_req_source.attendance_events(like public.attendance_events including all);
create table kitty_req_source.employee_schedules(like public.employee_schedules including all);
create table kitty_req_source.daily_attendance(like public.daily_attendance including all);
create table kitty_req_source.shifts(like public.shifts including all);
create table kitty_req_fixture.hr_access(id uuid,line_user_id text,status text);
insert into kitty_req_source.employees(id,employee_code,name,line_user_id,attendance_mode,active)
values('10000000-0000-4000-8000-000000000001','HO999','Synthetic HO','test-ho','STANDARD',true),
('10000000-0000-4000-8000-000000000002','BA999','Synthetic BA','test-ba','MULTI_BRANCH',true);
insert into kitty_req_source.admins(id,name,line_user_id,role,active) values('20000000-0000-4000-8000-000000000001','Synthetic Admin','test-admin','ADMIN',true);
insert into kitty_req_fixture.hr_access values('20000000-0000-4000-8000-000000000002','test-hr','APPROVED');
CREATE OR REPLACE FUNCTION kitty_req_source.recalculate_daily(p_employee_id uuid, p_work_date date)
 RETURNS daily_attendance
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'kitty_req_source'
AS $function$
declare
  v_schedule employee_schedules%rowtype;
  v_employee employees%rowtype;
  v_shift shifts%rowtype;
  v_in timestamptz;
  v_out timestamptz;
  v_break_out timestamptz;
  v_break_in timestamptz;
  v_effective_break_in timestamptz;
  v_gross numeric := 0;
  v_break numeric := 0;
  v_excess_break numeric := 0;
  v_paid numeric := 0;
  v_short numeric := 0;
  v_raw_over numeric := 0;
  v_over numeric := 0;
  v_makeup numeric := 0;
  v_required numeric := 0;
  v_status text;
  v_attendance_status text;
  v_is_leave boolean := false;
  v_is_absent boolean := false;
  v_result daily_attendance%rowtype;
begin
  select *
  into v_employee
  from kitty_req_source.employees
  where id = p_employee_id;

  select *
  into v_schedule
  from kitty_req_source.employee_schedules
  where employee_id = p_employee_id
    and work_date = p_work_date;

  if v_schedule.shift_id is not null then
    select *
    into v_shift
    from kitty_req_source.shifts
    where id = v_schedule.shift_id;
  end if;

  v_required := case
    when v_employee.attendance_mode = 'DRIVER' then 9
    else coalesce(v_schedule.required_hours, v_shift.required_hours, 9)
  end;

  select
    min(event_at) filter (where event_type in ('IN','DAY_IN','WORK_IN')),
    max(event_at) filter (where event_type in ('OUT','DAY_OUT','WORK_OUT')),
    min(event_at) filter (where event_type = 'BREAK_OUT'),
    max(event_at) filter (where event_type = 'BREAK_IN')
  into
    v_in,
    v_out,
    v_break_out,
    v_break_in
  from kitty_req_source.attendance_events
  where employee_id = p_employee_id
    and work_date = p_work_date;

  v_effective_break_in := v_break_in;

  if v_employee.attendance_mode = 'DRIVER'
     and v_break_out is not null
     and v_break_in is null
     and v_out is not null
     and v_out >= v_break_out then
    v_effective_break_in := v_out;
  end if;

  if v_in is not null and v_out is not null then
    v_gross := extract(epoch from (v_out - v_in)) / 3600.0;

    if v_break_out is not null
       and v_effective_break_in is not null
       and v_effective_break_in >= v_break_out then
      v_break := extract(epoch from (v_effective_break_in - v_break_out)) / 3600.0;
    end if;

    v_excess_break := case
      when v_employee.attendance_mode = 'DRIVER' then v_break
      else greatest(0, v_break - 1)
    end;

    v_paid := greatest(0, v_gross - v_excess_break);
  end if;

  if v_employee.attendance_mode = 'DRIVER' then
    if v_in is null then
      v_status := 'OFF';
      v_attendance_status := 'OFF';
    elsif v_out is null then
      v_status := 'NO_CHECKOUT';
      v_attendance_status := 'IN_PROGRESS';
    else
      v_short := greatest(0, 9 - v_paid);
      v_over := greatest(0, v_paid - 9);

      v_status := case
        when v_short > 0 then 'SHORT'
        when v_over > 0 then 'OVER'
        else 'COMPLETE'
      end;

      v_attendance_status := 'OUT';
    end if;

  elsif v_schedule.schedule_status in (
    'SICK_LEAVE',
    'BUSINESS_LEAVE',
    'VACATION',
    'UNPAID_LEAVE',
    'HOLIDAY'
  ) then
    v_is_leave := v_schedule.schedule_status <> 'HOLIDAY';
    v_status := v_schedule.schedule_status::text;
    v_attendance_status := v_status;

  elsif v_schedule.schedule_status = 'WFH' then
    v_paid := v_required;
    v_status := 'WFH';
    v_attendance_status := 'WFH';

  elsif v_schedule.schedule_status = 'OFF' then
    if v_in is not null and v_out is not null then
      v_makeup := v_paid;
      v_status := 'MAKEUP';
      v_attendance_status := 'OUT';
    else
      v_status := 'OFF';
      v_attendance_status := 'OFF';
    end if;

  elsif v_in is null then
    v_short := v_required;
    v_is_absent := true;
    v_status := 'ABSENT';
    v_attendance_status := 'NO_IN';

  elsif v_out is null then
    v_status := 'NO_CHECKOUT';
    v_attendance_status := 'IN_PROGRESS';

  else
    v_short := greatest(0, v_required - v_paid);
    v_raw_over := greatest(0, v_paid - v_required);
    v_over := case when v_raw_over > 0.5 then v_raw_over else 0 end;

    v_status := case
      when v_short > 0 then 'SHORT'
      when v_over > 0 then 'OVER'
      else 'COMPLETE'
    end;

    v_attendance_status := 'OUT';
  end if;

  insert into kitty_req_source.daily_attendance(
    work_date,
    employee_id,
    office_id,
    shift_id,
    schedule_status,
    attendance_mode,
    required_hours,
    first_in_at,
    break_out_at,
    break_in_at,
    last_out_at,
    gross_hours,
    break_hours,
    excess_break_hours,
    paid_work_hours,
    short_hours,
    over_hours,
    makeup_hours,
    net_hours,
    work_status,
    attendance_status,
    is_leave,
    is_absent,
    updated_at
  )
  values(
    p_work_date,
    p_employee_id,
    v_schedule.office_id,
    v_schedule.shift_id,
    coalesce(v_schedule.schedule_status, 'WORK'),
    v_employee.attendance_mode,
    v_required,
    v_in,
    v_break_out,
    v_break_in,
    v_out,
    round(v_gross, 2),
    round(v_break, 2),
    round(v_excess_break, 2),
    round(v_paid, 2),
    round(v_short, 2),
    round(v_over, 2),
    round(v_makeup, 2),
    round(v_over + v_makeup - v_short, 2),
    v_status,
    v_attendance_status,
    v_is_leave,
    v_is_absent,
    now()
  )
  on conflict(work_date, employee_id)
  do update set
    office_id = excluded.office_id,
    shift_id = excluded.shift_id,
    schedule_status = excluded.schedule_status,
    attendance_mode = excluded.attendance_mode,
    required_hours = excluded.required_hours,
    first_in_at = excluded.first_in_at,
    break_out_at = excluded.break_out_at,
    break_in_at = excluded.break_in_at,
    last_out_at = excluded.last_out_at,
    gross_hours = excluded.gross_hours,
    break_hours = excluded.break_hours,
    excess_break_hours = excluded.excess_break_hours,
    paid_work_hours = excluded.paid_work_hours,
    short_hours = excluded.short_hours,
    over_hours = excluded.over_hours,
    makeup_hours = excluded.makeup_hours,
    net_hours = excluded.net_hours,
    work_status = excluded.work_status,
    attendance_status = excluded.attendance_status,
    is_leave = excluded.is_leave,
    is_absent = excluded.is_absent,
    updated_at = now()
  returning * into v_result;

  return v_result;
end $function$;

-- Apply this file explicitly, NOT db push (older migrations are not approved).
-- Adds live requests and a narrowly scoped daily projection trigger. Does not import staging rows.

set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- kitty_req_fixture was installed with live HR access; no test rows are imported.
revoke all on schema kitty_req_fixture from public, anon, authenticated;

create table kitty_req_fixture.requests (
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
   and deduction_amount=0)
   or ((status<>'APPROVED' or kind<>'correction') and approved_sequence_in_month is null and deduction_amount=0))
);
create index on kitty_req_fixture.requests(employee_id,work_date);
create index on kitty_req_fixture.requests(status,created_at desc);
create unique index pending_correction on kitty_req_fixture.requests(employee_id,work_date,requested_event_type) where kind='correction' and status='PENDING';
create unique index pending_leave on kitty_req_fixture.requests(employee_id,work_date,duration) where kind='leave' and status='PENDING';
create table kitty_req_fixture.request_audit (
 id bigint generated always as identity primary key,
 request_id uuid not null references kitty_req_fixture.requests(id),
 actor_line_user_id text not null,
 action text not null,
 created_at timestamptz not null default now()
);
alter table kitty_req_fixture.requests enable row level security;
alter table kitty_req_fixture.request_audit enable row level security;
revoke all on all tables in schema kitty_req_fixture from public,anon,authenticated;
revoke all on all sequences in schema kitty_req_fixture from public,anon,authenticated;

create table kitty_req_fixture.request_effects(
 request_id uuid primary key references kitty_req_fixture.requests(id),event_id uuid,before_schedule jsonb,after_schedule jsonb,
 created_at timestamptz not null default now()
);
alter table kitty_req_fixture.request_effects enable row level security;
revoke all on kitty_req_fixture.request_effects from public,anon,authenticated;
-- Trigger affects only explicitly APPROVED new live leave requests, never ordinary work days.
create function kitty_req_fixture.apply_leave_daily()
returns trigger language plpgsql security definer set search_path=pg_catalog as $f$
declare r kitty_req_fixture.requests%rowtype;net numeric;
begin
 select * into r from kitty_req_fixture.requests where employee_id=new.employee_id and work_date=new.work_date and kind='leave' and status='APPROVED' order by reviewed_at desc limit 1;
 if r.id is null then return new;end if;
 if not exists(select 1 from kitty_req_source.employee_schedules s where s.employee_id=new.employee_id and s.work_date=new.work_date and s.adjustment_type='APPROVED_LEAVE' and s.approval_status='APPROVED') then return new;end if;
 if r.duration='FULL_DAY' then
  new.required_hours:=0;new.short_hours:=0;new.over_hours:=0;new.makeup_hours:=0;new.net_hours:=0;new.is_absent:=false;new.is_leave:=true;
  new.work_status:=case r.leave_type when 'ลาป่วย' then 'SICK_LEAVE' when 'ลากิจ' then 'BUSINESS_LEAVE' when 'ลาพักร้อน' then 'VACATION' else 'UNPAID_LEAVE' end;
  new.attendance_status:=new.work_status;
 else
  new.required_hours:=4;
  -- Use raw event timestamps, not rounded/paid break-inclusive hours.
  if new.first_in_at is not null and new.last_out_at is not null then
   if (new.break_out_at is null)<>(new.break_in_at is null) then
    new.work_status:='NO_CHECKOUT';new.attendance_status:='IN_PROGRESS';new.short_hours:=0;new.over_hours:=0;new.net_hours:=0;return new;
   end if;
   net:=greatest(0,extract(epoch from(new.last_out_at-new.first_in_at))/3600.0-case when new.break_out_at is not null and new.break_in_at>=new.break_out_at then extract(epoch from(new.break_in_at-new.break_out_at))/3600.0 else 0 end);
   new.paid_work_hours:=round(net,2);new.short_hours:=round(greatest(0,4-net),2);new.over_hours:=round(greatest(0,net-4),2);
   new.work_status:=case when net<4 then 'SHORT' when net>4 then 'OVER' else 'COMPLETE' end;new.attendance_status:='OUT';
  elsif new.first_in_at is null then new.short_hours:=4;new.over_hours:=0;new.work_status:='ABSENT';new.attendance_status:='NO_IN';
  else new.short_hours:=0;new.over_hours:=0;new.work_status:='NO_CHECKOUT';new.attendance_status:='IN_PROGRESS';end if;
  new.makeup_hours:=0;new.net_hours:=new.over_hours-new.short_hours;
 end if;
 return new;
end;$f$;
revoke all on function kitty_req_fixture.apply_leave_daily() from public,anon,authenticated;
create trigger kitty_req_fixture_leave_adjustment before insert or update on kitty_req_source.daily_attendance for each row execute function kitty_req_fixture.apply_leave_daily();
create function public.kitty_req_fixture_request_v1(actor text, operation text, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $fn$
declare
 emp kitty_req_source.employees%rowtype;
 manager kitty_req_source.admins%rowtype;
 target kitty_req_source.employees%rowtype;
 schedule_before kitty_req_source.employee_schedules%rowtype; new_event kitty_req_source.attendance_events%rowtype; leave_status kitty_req_source.employee_schedules.schedule_status%type;
 req kitty_req_fixture.requests%rowtype;
 current_req kitty_req_fixture.requests%rowtype;
 is_hr boolean;
 request_date date;
 event_time timestamptz;
 client uuid;
 seq integer;
 result jsonb;
 today date := (now() at time zone 'Asia/Bangkok')::date;
begin
 if actor is null or length(actor)=0 then raise exception 'UNAUTHENTICATED'; end if;
 if (select count(*) from kitty_req_source.employees where line_user_id=actor and active)>1
   or (select count(*) from kitty_req_source.admins where line_user_id=actor and active)>1 then raise exception 'AMBIGUOUS_IDENTITY'; end if;
 select * into emp from kitty_req_source.employees where line_user_id=actor and active;
 select * into manager from kitty_req_source.admins where line_user_id=actor and active and upper(role)='ADMIN';
 if manager.id is null then
  select id,'HR' into manager.id,manager.role from kitty_req_fixture.hr_access where line_user_id=actor and status='APPROVED';
 end if;
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
   perform pg_advisory_xact_lock(hashtextextended('kitty-live:'||emp.id::text,0));
   select * into req from kitty_req_fixture.requests where employee_id=emp.id and client_id=client;
   if req.id is not null then
     if req.kind<>payload->>'kind' or req.work_date<>request_date or req.reason<>btrim(payload->>'reason')
       or (req.kind='leave' and (req.duration<>payload->>'duration' or req.leave_type<>payload->>'type'))
       or (req.kind='correction' and (req.requested_event_type<>payload->>'event' or req.requested_event_at<>event_time)) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
     return jsonb_build_object('ok',true,'request',to_jsonb(req),'replayed',true,'sandbox',false);
   end if;
   insert into kitty_req_fixture.requests(employee_id,client_id,kind,work_date,leave_type,duration,required_net_minutes,requested_event_type,requested_event_at,reason)
   values(emp.id,client,payload->>'kind',request_date,
     case when payload->>'kind'='leave' then payload->>'type' end,
     case when payload->>'kind'='leave' then payload->>'duration' end,
     case when payload->>'kind'='leave' then case when payload->>'duration'='FULL_DAY' then 0 else 240 end end,
     case when payload->>'kind'='correction' then payload->>'event' end,event_time,btrim(payload->>'reason')) returning * into req;
   insert into kitty_req_fixture.request_audit(request_id,actor_line_user_id,action) values(req.id,actor,'SUBMIT');
   return jsonb_build_object('ok',true,'request',to_jsonb(req),'sandbox',false);
 end if;

 if operation in ('review','cancel') then
   select * into req from kitty_req_fixture.requests where id=(payload->>'id')::uuid;
   if req.id is null then raise exception 'NOT_FOUND'; end if;
   if operation='cancel' then
     if emp.id is null or emp.id<>req.employee_id then raise exception 'FORBIDDEN'; end if;
   else
     if manager.id is null then raise exception 'FORBIDDEN'; end if;
     select * into target from kitty_req_source.employees where id=req.employee_id;
     if is_hr and (target.id is null or coalesce(target.employee_code,'') !~* '^HO'
       or upper(coalesce(target.attendance_mode::text,'')) in ('MULTI_BRANCH','DRIVER')) then raise exception 'FORBIDDEN'; end if;
     if coalesce(payload->>'decision','') not in ('APPROVED','REJECTED') then raise exception 'INVALID_DECISION'; end if;
     if payload->>'decision'='REJECTED' and length(btrim(coalesce(payload->>'reviewReason','')))=0 then raise exception 'REJECTION_REASON_REQUIRED'; end if;
   end if;
   if length(coalesce(payload->>'reviewReason',''))>1000 then raise exception 'INVALID_REASON'; end if;
   perform pg_advisory_xact_lock(hashtextextended('kitty-live:'||req.employee_id::text,0));
   select * into current_req from kitty_req_fixture.requests where id=req.id for update;
   if current_req.status<>'PENDING' then
     if (operation='cancel' and current_req.status='CANCELLED')
       or (operation='review' and current_req.status=payload->>'decision') then
       return jsonb_build_object('ok',true,'request',to_jsonb(current_req),'replayed',true,'sandbox',false);
     end if;
     raise exception 'ALREADY_REVIEWED';
   end if;
   if operation='review' and payload->>'decision'='APPROVED' and req.kind='correction' then
     select count(*)+1 into seq from kitty_req_fixture.requests
       where employee_id=req.employee_id and kind='correction' and status='APPROVED'
       and work_date>=date_trunc('month',req.work_date)::date
       and work_date<(date_trunc('month',req.work_date)+interval '1 month')::date;
   end if;
   update kitty_req_fixture.requests set
     status=case when operation='cancel' then 'CANCELLED' else payload->>'decision' end,
     reviewed_by=case when operation='review' then manager.id end,
     review_reason=nullif(btrim(payload->>'reviewReason'),''),
     reviewed_at=now(),approved_sequence_in_month=seq,deduction_amount=0
   where id=req.id returning * into req;
   if operation='review' and req.status='APPROVED' then
     select * into target from kitty_req_source.employees where id=req.employee_id;
     if not target.active then raise exception 'EMPLOYEE_INACTIVE';end if;
     if req.kind='correction' then
       if target.attendance_mode::text='MULTI_BRANCH' then raise exception 'USE_ADMIN_BRANCH_CORRECTION';end if;
       if exists(select 1 from kitty_req_source.attendance_events where employee_id=req.employee_id and work_date=req.work_date and event_type::text=req.requested_event_type) then raise exception 'EVENT_ALREADY_EXISTS';end if;
       new_event.event_type:=req.requested_event_type;
       insert into kitty_req_source.attendance_events(employee_id,work_date,event_type,event_at,attendance_mode,source,edited_by_line_user_id,edited_at,metadata)
       values(req.employee_id,req.work_date,new_event.event_type,req.requested_event_at,target.attendance_mode,'APPROVED_REQUEST',actor,now(),jsonb_build_object('request_id',req.id,'reason',req.reason))
       returning * into new_event;
       if exists(
         select 1 from kitty_req_source.attendance_events a join kitty_req_source.attendance_events b on a.employee_id=b.employee_id and a.work_date=b.work_date
         where a.employee_id=req.employee_id and a.work_date=req.work_date and
         ((a.event_type::text='IN' and b.event_type::text in ('BREAK_OUT','BREAK_IN','OUT') and a.event_at>b.event_at)
          or (a.event_type::text='BREAK_OUT' and b.event_type::text='BREAK_IN' and a.event_at>b.event_at)
          or (a.event_type::text in ('BREAK_OUT','BREAK_IN') and b.event_type::text='OUT' and a.event_at>b.event_at))
       ) then raise exception 'INVALID_EVENT_ORDER';end if;
       insert into kitty_req_fixture.request_effects(request_id,event_id) values(req.id,new_event.id);
     else
       if exists(select 1 from kitty_req_fixture.requests r where r.employee_id=req.employee_id and r.work_date=req.work_date and r.kind='leave' and r.status='APPROVED' and r.id<>req.id) then raise exception 'LEAVE_ALREADY_APPROVED';end if;
       select * into schedule_before from kitty_req_source.employee_schedules where employee_id=req.employee_id and work_date=req.work_date for update;
       if schedule_before.id is null or schedule_before.schedule_status::text not in ('WORK','WFH') then raise exception 'WORK_SCHEDULE_REQUIRED';end if;
       if req.duration<>'FULL_DAY' and schedule_before.schedule_status::text<>'WORK' then raise exception 'HALF_DAY_REQUIRES_CLOCK';end if;
       leave_status:=case when req.duration<>'FULL_DAY' then 'WORK' when req.leave_type='ลาป่วย' then 'SICK_LEAVE' when req.leave_type='ลากิจ' then 'BUSINESS_LEAVE' when req.leave_type='ลาพักร้อน' then 'VACATION' else 'UNPAID_LEAVE' end;
       update kitty_req_source.employee_schedules set schedule_status=leave_status,required_hours=case when req.duration='FULL_DAY' then 0 else 4 end,
         original_schedule_status=coalesce(original_schedule_status,schedule_status),adjustment_type='APPROVED_LEAVE',adjustment_reason=req.reason,
         adjusted_by_line_user_id=actor,adjusted_at=now(),approval_status='APPROVED',updated_at=now() where id=schedule_before.id;
       insert into kitty_req_fixture.request_effects(request_id,before_schedule,after_schedule) select req.id,to_jsonb(schedule_before),to_jsonb(s) from kitty_req_source.employee_schedules s where s.id=schedule_before.id;
     end if;
     perform kitty_req_source.recalculate_daily(req.employee_id,req.work_date);
   end if;
   insert into kitty_req_fixture.request_audit(request_id,actor_line_user_id,action) values(req.id,actor,req.status);
   return jsonb_build_object('ok',true,'request',to_jsonb(req),'sandbox',false);
 end if;

 if operation not in ('mine','queue','report') then raise exception 'INVALID_OPERATION'; end if;
 if operation='mine' and emp.id is null then raise exception 'EMPLOYEE_REQUIRED'; end if;
 if operation in ('queue','report') and manager.id is null then raise exception 'FORBIDDEN'; end if;
 if operation='report' and (coalesce(payload->>'month','') !~ '^\d{4}-(0[1-9]|1[0-2])$' or coalesce(payload->>'employeeId','')='') then raise exception 'INVALID_REPORT'; end if;
 if operation='report' then
   select * into target from kitty_req_source.employees where id=(payload->>'employeeId')::uuid;
   if target.id is null then raise exception 'NOT_FOUND'; end if;
   if is_hr and (coalesce(target.employee_code,'') !~* '^HO' or upper(coalesce(target.attendance_mode::text,'')) in ('MULTI_BRANCH','DRIVER')
     or coalesce(target.name,'') ~* '\m(shane|peet)\M') then raise exception 'FORBIDDEN'; end if;
 end if;
 select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) into result from (
   select r.created_at,to_jsonb(r)||jsonb_build_object(
     'leave_date',case when r.kind='leave' then r.work_date end,
     'employee',jsonb_build_object('id',e.id,'employee_code',e.employee_code,'name',e.name),
     'sandbox',false) as item
   from kitty_req_fixture.requests r join kitty_req_source.employees e on e.id=r.employee_id
   where (operation<>'mine' or r.employee_id=emp.id)
     and (operation<>'queue' or r.status='PENDING')
     and (operation<>'report' or (r.employee_id=(payload->>'employeeId')::uuid and r.work_date>=((payload->>'month')||'-01')::date
       and r.work_date<(((payload->>'month')||'-01')::date+interval '1 month')::date))
     and (operation='mine' or not is_hr or (e.employee_code ~* '^HO' and upper(coalesce(e.attendance_mode::text,'')) not in ('MULTI_BRANCH','DRIVER')))
   order by r.created_at desc limit 1000
 ) scoped;
 return jsonb_build_object('ok',true,'rows',result,'warnings','[]'::jsonb,'sandbox',false,'limit',1000);
end;
$fn$;
revoke all on function public.kitty_req_fixture_request_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_req_fixture_request_v1(text,text,jsonb) to service_role;
comment on function public.kitty_req_fixture_request_v1(text,text,jsonb) is 'Live request approval effects are transactional; never accepts a client employee identity.';



do $test$
declare e uuid:='10000000-0000-4000-8000-000000000001';d date:=(now() at time zone 'Asia/Bangkok')::date-2;r jsonb;rid text;row kitty_req_source.daily_attendance%rowtype;before_count integer;
begin
 insert into kitty_req_source.employee_schedules(employee_id,work_date,schedule_status,required_hours) values(e,d,'WORK',9);
 insert into kitty_req_source.attendance_events(employee_id,work_date,event_type,event_at) values
 (e,d,'IN',(d+time '09:00') at time zone 'Asia/Bangkok'),
 (e,d,'BREAK_OUT',(d+time '11:00') at time zone 'Asia/Bangkok'),
 (e,d,'BREAK_IN',(d+time '11:30') at time zone 'Asia/Bangkok'),
 (e,d,'OUT',(d+time '13:30') at time zone 'Asia/Bangkok');
 row:=kitty_req_source.recalculate_daily(e,d);assert row.paid_work_hours=4.5;assert row.required_hours=9;
 r:=public.kitty_req_fixture_request_v1('test-ho','submit',jsonb_build_object('kind','leave','type','ลากิจ','duration','HALF_DAY_AM','reason','Half day','date',d,'clientId','30000000-0000-4000-8000-000000000001'));rid:=r->'request'->>'id';
 perform public.kitty_req_fixture_request_v1('test-hr','review',jsonb_build_object('id',rid,'decision','APPROVED'));
 select * into row from kitty_req_source.daily_attendance where employee_id=e and work_date=d;
 assert row.required_hours=4;assert row.paid_work_hours=4;assert row.short_hours=0;
 perform public.kitty_req_fixture_request_v1('test-hr','review',jsonb_build_object('id',rid,'decision','APPROVED'));
 assert (select count(*) from kitty_req_fixture.request_effects)=1;
 insert into kitty_req_source.employee_schedules(employee_id,work_date,schedule_status,required_hours) values(e,d-1,'WORK',9);
 r:=public.kitty_req_fixture_request_v1('test-ho','submit',jsonb_build_object('kind','correction','event','IN','time','09:00','reason','Forgot','date',d-1,'clientId','30000000-0000-4000-8000-000000000002'));rid:=r->'request'->>'id';
 r:=public.kitty_req_fixture_request_v1('test-hr','review',jsonb_build_object('id',rid,'decision','APPROVED'));
 assert r->'request'->>'approved_sequence_in_month'='1';assert r->'request'->>'deduction_amount'='0';
 assert (select count(*) from kitty_req_source.attendance_events where employee_id=e and work_date=d-1)=1;
 perform public.kitty_req_fixture_request_v1('test-hr','review',jsonb_build_object('id',rid,'decision','APPROVED'));
 assert (select count(*) from kitty_req_source.attendance_events where employee_id=e and work_date=d-1)=1;
 r:=public.kitty_req_fixture_request_v1('test-ba','submit',jsonb_build_object('kind','correction','event','IN','time','09:00','reason','BA test','date',d,'clientId','30000000-0000-4000-8000-000000000003'));rid:=r->'request'->>'id';
 begin perform public.kitty_req_fixture_request_v1('test-hr','review',jsonb_build_object('id',rid,'decision','APPROVED'));raise exception 'Expected forbidden';exception when raise_exception then assert sqlerrm='FORBIDDEN';end;
 assert (select count(*) from kitty_req_source.attendance_events where employee_id='10000000-0000-4000-8000-000000000002')=0;
 -- Ordinary day remains governed by original calculation.
 insert into kitty_req_source.employee_schedules(employee_id,work_date,schedule_status,required_hours) values(e,d-3,'WORK',9);
 row:=kitty_req_source.recalculate_daily(e,d-3);assert row.required_hours=9;assert row.short_hours=9;
 -- Invalid chronology rolls back both event insertion and approved status.
 r:=public.kitty_req_fixture_request_v1('test-ho','submit',jsonb_build_object('kind','correction','event','OUT','time','08:00','reason','Bad order test','date',d-1,'clientId','30000000-0000-4000-8000-000000000004'));rid:=r->'request'->>'id';
 begin perform public.kitty_req_fixture_request_v1('test-admin','review',jsonb_build_object('id',rid,'decision','APPROVED'));raise exception 'Expected invalid order';exception when raise_exception then assert sqlerrm='INVALID_EVENT_ORDER';end;
 assert (select status from kitty_req_fixture.requests where id=rid::uuid)='PENDING';
 assert (select count(*) from kitty_req_source.attendance_events where employee_id=e and work_date=d-1)=1;
 -- An explicit legacy admin override must remain authoritative.
 update kitty_req_source.employee_schedules set adjustment_type='ADMIN_OVERRIDE',required_hours=9 where employee_id=e and work_date=d;
 row:=kitty_req_source.recalculate_daily(e,d);assert row.required_hours=9;assert row.paid_work_hours=4.5;
 assert not has_function_privilege('anon','public.kitty_req_fixture_request_v1(text,text,jsonb)','execute');
end;$test$;
rollback;
