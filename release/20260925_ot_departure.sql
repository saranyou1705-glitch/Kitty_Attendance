begin;
set local lock_timeout='5s';
create or replace function kitty_live.ot_pair(employee uuid,mode text,workday date)
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

 select s.required_hours,d.paid_work_hours,d.last_out_at,d.break_out_at,d.break_in_at,d.first_in_at into a from public.employee_schedules s
 left join public.daily_attendance d on d.employee_id=s.employee_id and d.work_date=s.work_date where s.employee_id=employee and s.work_date=source_day;
 select s.required_hours,d.paid_work_hours,d.last_out_at,d.break_out_at,d.break_in_at,d.first_in_at into b from public.employee_schedules s
 left join public.daily_attendance d on d.employee_id=s.employee_id and d.work_date=s.work_date where s.employee_id=employee and s.work_date=target_day;
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
revoke all on function kitty_live.ot_pair(uuid,text,date) from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
