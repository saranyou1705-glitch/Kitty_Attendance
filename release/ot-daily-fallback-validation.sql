begin;
create schema kitty_ot_day_test;
create table kitty_ot_day_test.employees(like public.employees including all);
create table kitty_ot_day_test.employee_schedules(like public.employee_schedules including all);
create table kitty_ot_day_test.daily_attendance(like public.daily_attendance including all);
alter table kitty_ot_day_test.daily_attendance alter column schedule_status set default 'WORK', alter column attendance_mode set default 'STANDARD', alter column work_status set default 'COMPLETE', alter column attendance_status set default 'OUT';
insert into kitty_ot_day_test.employees(id,employee_code,name,line_user_id,attendance_mode,active)
values('10000000-0000-4000-8000-000000000001','HO999','Synthetic','fixture','STANDARD',true);

set local lock_timeout='5s';
-- Explicit schedules always win. A real daily record can prove a working day
-- when a new employee has no monthly schedule. Never invent a missing holiday.
create or replace function kitty_ot_day_test.ot_workdays(employee uuid)
returns table(employee_id uuid,work_date date,required_hours numeric,schedule_status text)
language sql stable security definer set search_path=pg_catalog as $h$
 select s.employee_id,s.work_date,s.required_hours::numeric,s.schedule_status::text
 from kitty_ot_day_test.employee_schedules s where s.employee_id=employee
 union all
 select d.employee_id,d.work_date,d.required_hours::numeric,d.schedule_status::text
 from kitty_ot_day_test.daily_attendance d join kitty_ot_day_test.employees e on e.id=d.employee_id
 where d.employee_id=employee and e.employee_code ~ '^HO'
 and e.attendance_mode::text in ('STANDARD','STOCK_REFILL')
 and d.first_in_at is not null and d.schedule_status::text='WORK' and d.required_hours>0
 and not exists(select 1 from kitty_ot_day_test.employee_schedules s where s.employee_id=d.employee_id and s.work_date=d.work_date);
$h$;
revoke all on function kitty_ot_day_test.ot_workdays(uuid) from public,anon,authenticated;

create or replace function kitty_ot_day_test.ot_pair(employee uuid,mode text,workday date)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare source_day date;target_day date;a record;b record;
begin
 if mode not in ('USE_PRIOR','MAKEUP_NEXT') or mode is null then raise exception 'INVALID_OT_MODE'; end if;
 if not exists(select 1 from kitty_ot_day_test.ot_workdays(employee) s where s.employee_id=employee and s.work_date=workday
   and s.required_hours>0 and s.schedule_status::text in ('WORK','WFH')) then raise exception 'OT_SCHEDULE_REQUIRED'; end if;
 if mode='USE_PRIOR' then
   target_day:=workday;
   select max(work_date) into source_day from kitty_ot_day_test.ot_workdays(employee) where employee_id=employee and work_date<workday and required_hours>0 and schedule_status::text in ('WORK','WFH');
 else
   source_day:=workday;
   select min(work_date) into target_day from kitty_ot_day_test.ot_workdays(employee) where employee_id=employee and work_date>workday and required_hours>0 and schedule_status::text in ('WORK','WFH');
 end if;
 if source_day is null or target_day is null then raise exception 'OT_SCHEDULE_REQUIRED'; end if;
 -- Missing intervening schedules are unknown, not assumed holidays.
 if exists(select 1 from generate_series(source_day+1,target_day-1,interval '1 day') d
   where not exists(select 1 from kitty_ot_day_test.ot_workdays(employee) s where s.employee_id=employee and s.work_date=d::date)) then raise exception 'OT_SCHEDULE_REQUIRED'; end if;

 select s.required_hours,d.paid_work_hours,d.last_out_at,d.break_out_at,d.break_in_at,d.first_in_at into a from kitty_ot_day_test.ot_workdays(employee) s
 left join kitty_ot_day_test.daily_attendance d on d.employee_id=s.employee_id and d.work_date=s.work_date where s.employee_id=employee and s.work_date=source_day;
 select s.required_hours,d.paid_work_hours,d.last_out_at,d.break_out_at,d.break_in_at,d.first_in_at into b from kitty_ot_day_test.ot_workdays(employee) s
 left join kitty_ot_day_test.daily_attendance d on d.employee_id=s.employee_id and d.work_date=s.work_date where s.employee_id=employee and s.work_date=target_day;
 return jsonb_build_object('source_date',source_day,'target_date',target_day,
 'source_first_in_at',a.first_in_at,'target_first_in_at',b.first_in_at,
 'target_last_out_at',b.last_out_at,
 'source_final',a.last_out_at is not null and a.paid_work_hours is not null and (a.break_out_at is null)=(a.break_in_at is null),
 'source_paid_minutes',round(a.paid_work_hours*60),'target_paid_minutes',round(b.paid_work_hours*60),
 'source_required_minutes',round(a.required_hours*60),'target_required_minutes',round(b.required_hours*60),
 'settlement_state',case when a.last_out_at is null or b.last_out_at is null or a.paid_work_hours is null or b.paid_work_hours is null or (a.break_out_at is null)<>(a.break_in_at is null) or (b.break_out_at is null)<>(b.break_in_at is null) then 'WAITING' else 'READY' end,
 'source_capacity',greatest(0,round((case when mode='USE_PRIOR' then a.paid_work_hours-a.required_hours else a.required_hours-a.paid_work_hours end)*60)),
 'target_capacity',greatest(0,round((case when mode='USE_PRIOR' then b.required_hours-b.paid_work_hours else b.paid_work_hours-b.required_hours end)*60)));
end;$f$;
revoke all on function kitty_ot_day_test.ot_pair(uuid,text,date) from public,anon,authenticated;

notify pgrst,'reload schema';


insert into kitty_ot_day_test.daily_attendance(employee_id,work_date,required_hours,paid_work_hours,first_in_at,last_out_at)
values('10000000-0000-4000-8000-000000000001','2040-01-24',9,13.26,'2040-01-24T03:00Z','2040-01-24T16:16Z'),
('10000000-0000-4000-8000-000000000001','2040-01-25',9,8.54,'2040-01-25T03:00Z','2040-01-25T11:32Z');
do $t$
declare e uuid:='10000000-0000-4000-8000-000000000001';p jsonb;
begin
 p:=kitty_ot_day_test.ot_pair(e,'USE_PRIOR','2040-01-25');
 if p->>'source_date'<>'2040-01-24' or (p->>'source_capacity')::integer<>256 or p->>'settlement_state'<>'READY' then raise exception 'Daily fallback failed: %',p;end if;
 p:=kitty_ot_day_test.ot_pair(e,'MAKEUP_NEXT','2040-01-24');
 if p->>'target_date'<>'2040-01-25' then raise exception 'Forward lookup failed';end if;
 insert into kitty_ot_day_test.employee_schedules(employee_id,work_date,schedule_status,required_hours) values(e,'2040-01-24','OFF',0);
 begin
  perform kitty_ot_day_test.ot_pair(e,'USE_PRIOR','2040-01-25');
  raise exception 'Explicit OFF overridden';
 exception when others then if sqlerrm<>'OT_SCHEDULE_REQUIRED' then raise;end if;end;
 delete from kitty_ot_day_test.employee_schedules where employee_id=e;
 update kitty_ot_day_test.daily_attendance set work_date='2040-01-26' where work_date='2040-01-25';
 begin
  perform kitty_ot_day_test.ot_pair(e,'USE_PRIOR','2040-01-26');
  raise exception 'Unknown intervening day skipped';
 exception when others then if sqlerrm<>'OT_SCHEDULE_REQUIRED' then raise;end if;end;
end;$t$;
rollback;
