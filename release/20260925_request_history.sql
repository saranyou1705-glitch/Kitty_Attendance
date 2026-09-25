begin;
set local lock_timeout='5s';
create or replace function public.kitty_live_history_v1(actor text,operation text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare is_admin boolean;is_hr boolean;result jsonb;v_kind text:=payload->>'kind';
begin
 if actor is null or actor='' then raise exception 'UNAUTHENTICATED';end if;
 if operation<>'history' or v_kind is null or v_kind not in ('leave','correction') then raise exception 'INVALID_REQUEST';end if;
 is_admin:=exists(select 1 from public.admins where line_user_id=actor and active and upper(role)='ADMIN');
 is_hr:=not is_admin and exists(select 1 from kitty_live.hr_access where line_user_id=actor and status='APPROVED');
 if not is_admin and not is_hr then raise exception 'FORBIDDEN';end if;
 is_hr:=is_hr or (is_admin and coalesce(payload->>'previewRole','')='HR');
 select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) into result from (
  select x.created_at,x.item||jsonb_build_object('employee',jsonb_build_object('id',e.id,'employee_code',e.employee_code,'name',e.name)) item
  from (
   select r.employee_id,r.created_at,to_jsonb(r)||jsonb_build_object('sandbox',false,'history_source','live') item
   from kitty_live.requests r where r.status in ('APPROVED','REJECTED','CANCELLED') and r.kind=v_kind
   union all
   select r.employee_id,r.created_at,to_jsonb(r)||jsonb_build_object('kind','overtime','sandbox',false,'history_source','live') from kitty_live.overtime_requests r
   where v_kind='correction' and r.status in ('APPROVED','REJECTED','CANCELLED')
   union all
   select r.employee_id,r.created_at,to_jsonb(r)||jsonb_build_object('sandbox',true,'history_source','before_production') from kitty_staging.requests r where r.kind=v_kind
   union all
   select r.employee_id,r.created_at,to_jsonb(r)||jsonb_build_object('kind','overtime','sandbox',true,'history_source','before_production') from kitty_staging.overtime_requests r where v_kind='correction'
  ) x join public.employees e on e.id=x.employee_id
  where not is_hr or (coalesce(e.employee_code,'') ~* '^HO' and upper(coalesce(e.attendance_mode::text,'')) not in ('MULTI_BRANCH','DRIVER'))
  order by x.created_at desc limit 1000
 ) scoped;
 return jsonb_build_object('ok',true,'rows',result,'limit',1000);
end;$f$;
revoke all on function public.kitty_live_history_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_live_history_v1(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
