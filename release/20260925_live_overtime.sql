-- Live OT: fresh requests only; never imports trial requests.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table kitty_live.overtime_requests(
 id uuid primary key default gen_random_uuid(), employee_id uuid not null, client_id uuid not null,
 mode text not null check(mode in ('USE_PRIOR','MAKEUP_NEXT')),
 work_date date not null,source_date date not null,target_date date not null check(target_date>source_date),
 minutes integer check(minutes between 0 and 1440),
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
 reviewed_by uuid,review_reason text,created_at timestamptz not null default now(),reviewed_at timestamptz,
 unique(employee_id,client_id)
);
create index on kitty_live.overtime_requests(employee_id,source_date,target_date,status);
create table kitty_live.overtime_audit(
 id bigint generated always as identity primary key,request_id uuid not null references kitty_live.overtime_requests(id),
 actor_line_user_id text not null,action text not null,created_at timestamptz not null default now()
);
alter table kitty_live.overtime_requests enable row level security;
alter table kitty_live.overtime_audit enable row level security;
revoke all on kitty_live.overtime_requests,kitty_live.overtime_audit from public,anon,authenticated;
revoke all on all sequences in schema kitty_live from public,anon,authenticated;

create function kitty_live.ot_pair(employee uuid,mode text,workday date)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare source_day date;target_day date;a record;b record;
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

 select s.required_hours,d.paid_work_hours,d.last_out_at,d.break_out_at,d.break_in_at into a from public.employee_schedules s
 left join public.daily_attendance d on d.employee_id=s.employee_id and d.work_date=s.work_date where s.employee_id=employee and s.work_date=source_day;
 select s.required_hours,d.paid_work_hours,d.last_out_at,d.break_out_at,d.break_in_at into b from public.employee_schedules s
 left join public.daily_attendance d on d.employee_id=s.employee_id and d.work_date=s.work_date where s.employee_id=employee and s.work_date=target_day;
 return jsonb_build_object('source_date',source_day,'target_date',target_day,
 'source_paid_minutes',round(a.paid_work_hours*60),'target_paid_minutes',round(b.paid_work_hours*60),
 'source_required_minutes',round(a.required_hours*60),'target_required_minutes',round(b.required_hours*60),
 'settlement_state',case when a.last_out_at is null or b.last_out_at is null or a.paid_work_hours is null or b.paid_work_hours is null or (a.break_out_at is null)<>(a.break_in_at is null) or (b.break_out_at is null)<>(b.break_in_at is null) then 'WAITING' else 'READY' end,
 'source_capacity',greatest(0,round((case when mode='USE_PRIOR' then a.paid_work_hours-a.required_hours else a.required_hours-a.paid_work_hours end)*60)),
 'target_capacity',greatest(0,round((case when mode='USE_PRIOR' then b.required_hours-b.paid_work_hours else b.paid_work_hours-b.required_hours end)*60)));
end;$f$;
revoke all on function kitty_live.ot_pair(uuid,text,date) from public,anon,authenticated;

create or replace function kitty_live.ot_balance(employee uuid,mode text,workday date,excluding uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare p jsonb;v jsonb;used jsonb:='{}';waiting jsonb:='{}';q record;k1 text;k2 text;n integer;a integer;b integer;seqtime timestamptz;
begin
 p:=kitty_live.ot_pair(employee,mode,workday);
 select created_at into seqtime from kitty_live.overtime_requests where id=excluding;
 -- Allocate actual minutes only, oldest workday pair first. No transferred balance is ever a new source.
 for q in select * from (
   select r.id,r.mode,r.work_date,r.source_date,r.target_date,r.created_at,false candidate from kitty_live.overtime_requests r
   where r.employee_id=employee and r.status='APPROVED' and (excluding is null or r.id<>excluding)
   union all select coalesce(excluding,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid),mode,workday,(p->>'source_date')::date,(p->>'target_date')::date,coalesce(seqtime,clock_timestamp()),true
 ) x order by source_date,target_date,created_at,id loop
   begin v:=kitty_live.ot_pair(employee,q.mode,q.work_date);
   exception when others then
     if q.candidate then raise; end if;
     v:=jsonb_build_object('settlement_state','WAITING');
   end;
   if v->>'source_date' is distinct from q.source_date::text or v->>'target_date' is distinct from q.target_date::text then
     v:=v||jsonb_build_object('settlement_state','SCHEDULE_CHANGED');
   end if;
   k1:=q.source_date::text||case when q.mode='USE_PRIOR' then ':over' else ':short' end;
   k2:=q.target_date::text||case when q.mode='USE_PRIOR' then ':short' else ':over' end;
   if v->>'settlement_state'<>'READY' or waiting ? k1 or waiting ? k2 then
     waiting:=waiting||jsonb_build_object(k1,true,k2,true);
     if q.candidate then return v||jsonb_build_object('settlement_state',case when v->>'settlement_state'='SCHEDULE_CHANGED' then 'SCHEDULE_CHANGED' else 'WAITING' end,'minutes',null,'available_minutes',null);end if;
   else
     a:=greatest(0,(v->>'source_capacity')::integer-coalesce((used->>k1)::integer,0));
     b:=greatest(0,(v->>'target_capacity')::integer-coalesce((used->>k2)::integer,0));
     n:=least(a,b);
     if q.candidate then return v||jsonb_build_object('minutes',n,'available_minutes',n,'remaining_short_minutes',case when mode='USE_PRIOR' then b-n else a-n end,'unused_over_minutes',case when mode='USE_PRIOR' then a-n else b-n end);end if;
     used:=used||jsonb_build_object(k1,coalesce((used->>k1)::integer,0)+n,k2,coalesce((used->>k2)::integer,0)+n);
   end if;
 end loop;
 return p;
end;$f$;
revoke all on function kitty_live.ot_balance(uuid,text,date,uuid) from public,anon,authenticated;
create function kitty_live.ot_display(r kitty_live.overtime_requests)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare b jsonb;
begin
 if r.status in ('REJECTED','CANCELLED') then return to_jsonb(r)||jsonb_build_object('minutes',null,'settlement_state','INACTIVE');end if;
 begin b:=kitty_live.ot_balance(r.employee_id,r.mode,r.work_date,r.id);
 exception when others then b:=jsonb_build_object('minutes',null,'settlement_state','SCHEDULE_CHANGED');end;
 if b->>'source_date' is distinct from r.source_date::text or b->>'target_date' is distinct from r.target_date::text then
   b:=b||jsonb_build_object('source_date',r.source_date,'target_date',r.target_date,'minutes',null,'settlement_state','SCHEDULE_CHANGED');
 end if;
 return to_jsonb(r)||b;
end;$f$;
revoke all on function kitty_live.ot_display(kitty_live.overtime_requests) from public,anon,authenticated;


-- Store unadjusted output of the existing calculator, not recomputed clock rules.
create table kitty_live.ot_day_base(
 employee_id uuid not null,work_date date not null,
 short_hours numeric,over_hours numeric,net_hours numeric,
 primary key(employee_id,work_date)
);
create table kitty_live.ot_effects(
 request_id uuid primary key references kitty_live.overtime_requests(id),
 minutes integer not null default 0,state text not null,updated_at timestamptz not null default now()
);
alter table kitty_live.ot_day_base enable row level security;
alter table kitty_live.ot_effects enable row level security;
revoke all on kitty_live.ot_day_base,kitty_live.ot_effects from public,anon,authenticated;

create function kitty_live.ot_refresh(employee uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $f$
declare req kitty_live.overtime_requests%rowtype;p jsonb;n integer;prior_guard text;d record;short_used numeric;over_used numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('kitty-ot:'||employee::text,0));
 -- Capture pre-OT values once. Normal recalculate updates this baseline via the trigger.
 insert into kitty_live.ot_day_base(employee_id,work_date,short_hours,over_hours,net_hours)
 select a.employee_id,a.work_date,a.short_hours,a.over_hours,a.net_hours from public.daily_attendance a
 where a.employee_id=employee and exists(select 1 from kitty_live.overtime_requests q where q.employee_id=employee and q.status='APPROVED' and a.work_date in(q.source_date,q.target_date))
 on conflict do nothing;
 for req in select * from kitty_live.overtime_requests where employee_id=employee and status='APPROVED' order by source_date,target_date,created_at,id loop
   p:=kitty_live.ot_display(req);
   n:=case when p->>'settlement_state'='READY' then coalesce((p->>'minutes')::integer,0) else 0 end;
   insert into kitty_live.ot_effects(request_id,minutes,state) values(req.id,n,p->>'settlement_state')
   on conflict(request_id) do update set minutes=excluded.minutes,state=excluded.state,updated_at=now();
 end loop;
 prior_guard:=current_setting('kitty.ot_projection',true);
 perform set_config('kitty.ot_projection','on',true);
 for d in select * from kitty_live.ot_day_base where employee_id=employee loop
   select coalesce(sum(e.minutes) filter(where
       (r.mode='USE_PRIOR' and r.target_date=d.work_date) or (r.mode='MAKEUP_NEXT' and r.source_date=d.work_date)),0)/60.0,
     coalesce(sum(e.minutes) filter(where
       (r.mode='USE_PRIOR' and r.source_date=d.work_date) or (r.mode='MAKEUP_NEXT' and r.target_date=d.work_date)),0)/60.0
   into short_used,over_used from kitty_live.overtime_requests r join kitty_live.ot_effects e on e.request_id=r.id
   where r.employee_id=employee and r.status='APPROVED' and e.state='READY' and d.work_date in(r.source_date,r.target_date);
   update public.daily_attendance a set
     short_hours=greatest(0,d.short_hours-short_used),
     over_hours=greatest(0,d.over_hours-over_used),
     net_hours=d.net_hours+least(coalesce(d.short_hours,0),short_used)-least(coalesce(d.over_hours,0),over_used)
   where a.employee_id=employee and a.work_date=d.work_date and
     (a.short_hours,a.over_hours,a.net_hours) is distinct from
     (greatest(0,d.short_hours-short_used),greatest(0,d.over_hours-over_used),
      d.net_hours+least(coalesce(d.short_hours,0),short_used)-least(coalesce(d.over_hours,0),over_used));
 end loop;
 perform set_config('kitty.ot_projection',coalesce(prior_guard,''),true);
 delete from kitty_live.ot_day_base base where base.employee_id=employee and not exists(select 1 from kitty_live.overtime_requests q where q.employee_id=employee and q.status='APPROVED' and base.work_date in(q.source_date,q.target_date));
end;$f$;
revoke all on function kitty_live.ot_refresh(uuid) from public,anon,authenticated;

create function kitty_live.ot_daily_changed()
returns trigger language plpgsql security definer set search_path=pg_catalog as $f$
begin
 if current_setting('kitty.ot_projection',true)='on' then return new; end if;
 if not exists(select 1 from kitty_live.overtime_requests where employee_id=new.employee_id and status='APPROVED') then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('kitty-ot:'||new.employee_id::text,0));
 if exists(select 1 from kitty_live.overtime_requests where employee_id=new.employee_id and status='APPROVED' and new.work_date in(source_date,target_date)) then
   insert into kitty_live.ot_day_base values(new.employee_id,new.work_date,new.short_hours,new.over_hours,new.net_hours)
   on conflict(employee_id,work_date) do update set short_hours=excluded.short_hours,over_hours=excluded.over_hours,net_hours=excluded.net_hours;
 end if;
 perform kitty_live.ot_refresh(new.employee_id);
 return new;
end;$f$;
revoke all on function kitty_live.ot_daily_changed() from public,anon,authenticated;
create trigger kitty_live_ot_daily after insert or update of paid_work_hours,required_hours,short_hours,over_hours,net_hours,first_in_at,last_out_at,break_out_at,break_in_at
on public.daily_attendance for each row execute function kitty_live.ot_daily_changed();

create function kitty_live.ot_daily_deleted()
returns trigger language plpgsql security definer set search_path=pg_catalog as $f$
begin
 delete from kitty_live.ot_day_base where employee_id=old.employee_id and work_date=old.work_date;
 if exists(select 1 from kitty_live.overtime_requests where employee_id=old.employee_id and status='APPROVED') then perform kitty_live.ot_refresh(old.employee_id);end if;
 return null;
end;$f$;
revoke all on function kitty_live.ot_daily_deleted() from public,anon,authenticated;
create trigger kitty_live_ot_deleted after delete on public.daily_attendance for each row execute function kitty_live.ot_daily_deleted();

create function kitty_live.ot_schedule_changed()
returns trigger language plpgsql security definer set search_path=pg_catalog as $f$
begin
 if exists(select 1 from kitty_live.overtime_requests where employee_id=coalesce(new.employee_id,old.employee_id) and status='APPROVED') then
   perform kitty_live.ot_refresh(coalesce(new.employee_id,old.employee_id));
 end if;
 return null;
end;$f$;
revoke all on function kitty_live.ot_schedule_changed() from public,anon,authenticated;
create trigger kitty_live_ot_schedule after insert or delete or update of required_hours,schedule_status,work_date
on public.employee_schedules for each row execute function kitty_live.ot_schedule_changed();


create or replace function public.kitty_live_overtime_v1(actor text,operation text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare emp public.employees%rowtype;manager public.admins%rowtype;target public.employees%rowtype;
 r kitty_live.overtime_requests%rowtype;balance jsonb;result jsonb;is_hr boolean;date_value date;amount integer;client uuid;
begin
 if actor is null or actor='' then raise exception 'UNAUTHENTICATED'; end if;
 if (select count(*) from public.employees where line_user_id=actor and active)>1
   or (select count(*) from public.admins where line_user_id=actor and active)>1 then raise exception 'AMBIGUOUS_IDENTITY'; end if;
 select * into emp from public.employees where line_user_id=actor and active;
 select * into manager from public.admins where line_user_id=actor and active and upper(role)='ADMIN';
 if manager.id is null then select id,'HR' into manager.id,manager.role from kitty_live.hr_access where line_user_id=actor and status='APPROVED'; end if;
 if emp.id is null and manager.id is null then raise exception 'FORBIDDEN'; end if;
 is_hr:=upper(coalesce(manager.role,''))='HR' or (manager.id is not null and coalesce(payload->>'previewRole','')='HR');
 if operation in ('submit','balance') then
   if emp.id is null then raise exception 'EMPLOYEE_REQUIRED'; end if;
   if coalesce(emp.employee_code,'') !~* '^HO' or emp.attendance_mode::text not in ('STANDARD','STOCK_REFILL') then raise exception 'OT_OFFICE_ONLY'; end if;
   if coalesce(payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'INVALID_DATE'; end if;
   date_value:=(payload->>'date')::date;
   if operation='submit' then
     if length(btrim(coalesce(payload->>'reason',''))) not between 1 and 1000 then raise exception 'INVALID_REQUEST'; end if;
     amount:=null;client:=(payload->>'clientId')::uuid;
     if client is null then raise exception 'INVALID_REQUEST'; end if;
   end if;
   perform pg_advisory_xact_lock(hashtextextended('kitty-ot:'||emp.id::text,0));
   if operation='submit' then
     select * into r from kitty_live.overtime_requests where employee_id=emp.id and client_id=client;
     if r.id is not null then
       if r.mode<>payload->>'mode' or r.work_date<>date_value or r.reason<>btrim(payload->>'reason') then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
       return jsonb_build_object('ok',true,'request',kitty_live.ot_display(r),'replayed',true,'sandbox',false);
     end if;
   end if;
   balance:=kitty_live.ot_balance(emp.id,payload->>'mode',date_value);
   if operation='balance' then return balance||jsonb_build_object('ok',true,'sandbox',false); end if;
   if date_value>(now() at time zone 'Asia/Bangkok')::date
     or (balance->>'target_date')::date<(now() at time zone 'Asia/Bangkok')::date then raise exception 'OT_WINDOW_EXPIRED'; end if;
   if exists(select 1 from kitty_live.overtime_requests x where x.employee_id=emp.id and x.mode=payload->>'mode' and x.work_date=date_value and x.status in ('PENDING','APPROVED')) then raise exception 'DUPLICATE_PENDING_REQUEST'; end if;
   insert into kitty_live.overtime_requests(employee_id,client_id,mode,work_date,source_date,target_date,minutes,reason)
   values(emp.id,client,payload->>'mode',date_value,(balance->>'source_date')::date,(balance->>'target_date')::date,amount,btrim(payload->>'reason')) returning * into r;
   insert into kitty_live.overtime_audit(request_id,actor_line_user_id,action) values(r.id,actor,'SUBMIT');
   return jsonb_build_object('ok',true,'request',kitty_live.ot_display(r),'sandbox',false);
 end if;
 if operation in ('review','cancel') then
   select * into r from kitty_live.overtime_requests where id=(payload->>'id')::uuid;
   if r.id is null then raise exception 'NOT_FOUND'; end if;
   if operation='cancel' then
     if emp.id is null or emp.id<>r.employee_id then raise exception 'FORBIDDEN'; end if;
   else
     if manager.id is null then raise exception 'FORBIDDEN'; end if;
     select * into target from public.employees where id=r.employee_id;
     if not coalesce(target.active,false) then raise exception 'EMPLOYEE_INACTIVE'; end if;
     if is_hr and (target.id is null or coalesce(target.employee_code,'') !~* '^HO' or upper(coalesce(target.attendance_mode::text,'')) in ('MULTI_BRANCH','DRIVER')) then raise exception 'FORBIDDEN'; end if;
     if coalesce(payload->>'decision','') not in ('APPROVED','REJECTED') then raise exception 'INVALID_DECISION'; end if;
     if payload->>'decision'='REJECTED' and length(btrim(coalesce(payload->>'reviewReason','')))=0 then raise exception 'REJECTION_REASON_REQUIRED'; end if;
   end if;
   if length(coalesce(payload->>'reviewReason',''))>1000 then raise exception 'INVALID_REASON'; end if;
   perform pg_advisory_xact_lock(hashtextextended('kitty-ot:'||r.employee_id::text,0));
   select * into r from kitty_live.overtime_requests where id=r.id for update;
   if r.status<>'PENDING' then
     if (operation='cancel' and r.status='CANCELLED') or (operation='review' and r.status=payload->>'decision') then return jsonb_build_object('ok',true,'request',kitty_live.ot_display(r),'replayed',true,'sandbox',false); end if;
     raise exception 'ALREADY_REVIEWED';
   end if;
   if operation='review' and payload->>'decision'='APPROVED' then
     balance:=kitty_live.ot_balance(r.employee_id,r.mode,r.work_date,r.id);
     if (balance->>'source_date')::date<>r.source_date or (balance->>'target_date')::date<>r.target_date then raise exception 'OT_SCHEDULE_CHANGED'; end if;

   end if;
   update kitty_live.overtime_requests set status=case when operation='cancel' then 'CANCELLED' else payload->>'decision' end,
     reviewed_by=case when operation='review' then manager.id end,review_reason=nullif(btrim(payload->>'reviewReason'),''),
     reviewed_at=now() where id=r.id returning * into r;
   insert into kitty_live.overtime_audit(request_id,actor_line_user_id,action) values(r.id,actor,r.status);
   perform kitty_live.ot_refresh(r.employee_id);
   return jsonb_build_object('ok',true,'request',kitty_live.ot_display(r),'sandbox',false);
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
   select q.created_at,kitty_live.ot_display(q)||jsonb_build_object('kind','overtime','sandbox',false,'employee',jsonb_build_object('id',e.id,'employee_code',e.employee_code,'name',e.name)) item
   from kitty_live.overtime_requests q join public.employees e on e.id=q.employee_id
   where (operation<>'mine' or q.employee_id=emp.id) and (operation<>'queue' or q.status='PENDING')
   and (operation<>'report' or (q.employee_id=target.id and (to_char(q.source_date,'YYYY-MM')=payload->>'month' or to_char(q.target_date,'YYYY-MM')=payload->>'month')))
   and (operation='mine' or not is_hr or (e.employee_code ~* '^HO' and upper(coalesce(e.attendance_mode::text,'')) not in ('MULTI_BRANCH','DRIVER')))
   order by q.created_at desc limit 1000
 ) x;
 return jsonb_build_object('ok',true,'rows',result,'warnings','[]'::jsonb,'sandbox',false);
end;$f$;
revoke all on function public.kitty_live_overtime_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_live_overtime_v1(text,text,jsonb) to service_role;
create or replace function kitty_live.apply_leave_daily()
returns trigger language plpgsql security definer set search_path=pg_catalog as $f$
declare r kitty_live.requests%rowtype;net numeric;
begin
 if current_setting('kitty.ot_projection',true)='on' then return new; end if;
 select * into r from kitty_live.requests where employee_id=new.employee_id and work_date=new.work_date and kind='leave' and status='APPROVED' order by reviewed_at desc limit 1;
 if r.id is null then return new;end if;
 if not exists(select 1 from public.employee_schedules s where s.employee_id=new.employee_id and s.work_date=new.work_date and s.adjustment_type='APPROVED_LEAVE' and s.approval_status='APPROVED') then return new;end if;
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
revoke all on function kitty_live.apply_leave_daily() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
