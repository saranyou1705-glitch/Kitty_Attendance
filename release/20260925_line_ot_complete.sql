begin;
set local lock_timeout='5s';
-- Report-only policy: never rewrites paid hours, events or payroll.
create or replace function kitty_live.ot_report_complete(p jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $f$
 select coalesce(
   p->>'status'='APPROVED' and p->>'settlement_state'='READY'
   and (p->>'source_capacity')::integer>0
   and (p->>'remaining_short_minutes')::integer=0
   and date_trunc('minute',(p->>'target_last_out_at')::timestamptz)>=
       date_trunc('minute',(p->>'target_first_in_at')::timestamptz)
       + make_interval(mins=>greatest(0,540+
          case when p->>'mode'='USE_PRIOR' then -(p->>'source_capacity')::integer
               else (p->>'source_capacity')::integer end)),false);
$f$;
revoke all on function kitty_live.ot_report_complete(jsonb) from public,anon,authenticated;
create or replace function public.kitty_live_line_ot_complete(report_date date)
returns jsonb language sql stable security definer set search_path=pg_catalog as $f$
 select coalesce(jsonb_agg(distinct r.employee_id),'[]'::jsonb)
 from kitty_live.overtime_requests r join public.employees e on e.id=r.employee_id
 where r.target_date=report_date and r.status='APPROVED'
   and e.employee_code ~ '^HO'
   and coalesce(e.attendance_mode::text,'') not in ('MULTI_BRANCH','DRIVER')
   and kitty_live.ot_report_complete(kitty_live.ot_display(r));
$f$;
revoke all on function public.kitty_live_line_ot_complete(date) from public,anon,authenticated;
grant execute on function public.kitty_live_line_ot_complete(date) to service_role;
notify pgrst,'reload schema';
commit;
