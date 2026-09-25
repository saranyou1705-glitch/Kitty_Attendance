begin;
create schema kitty_history_fixture;
create table kitty_history_fixture.employees(id uuid,employee_code text,name text,attendance_mode text);
create table kitty_history_fixture.admins(line_user_id text,active boolean,role text);
create table kitty_history_fixture.hr_access(line_user_id text,status text);
create table kitty_history_fixture.requests(employee_id uuid,created_at timestamptz,status text,kind text);
create table kitty_history_fixture.ot(like kitty_history_fixture.requests);
create table kitty_history_fixture.old_requests(like kitty_history_fixture.requests);
create table kitty_history_fixture.old_ot(like kitty_history_fixture.requests);
insert into kitty_history_fixture.admins values('admin',true,'ADMIN');
insert into kitty_history_fixture.hr_access values('hr','APPROVED');
insert into kitty_history_fixture.employees values('10000000-0000-4000-8000-000000000001','HO001','Office','STANDARD'),('10000000-0000-4000-8000-000000000002','BA001','BA','MULTI_BRANCH');
insert into kitty_history_fixture.ot select id,now(),'APPROVED','overtime' from kitty_history_fixture.employees;
insert into kitty_history_fixture.requests select id,now(),'PENDING','correction' from kitty_history_fixture.employees;
insert into kitty_history_fixture.old_ot select id,now(),'CANCELLED','overtime' from kitty_history_fixture.employees;

set local lock_timeout='5s';
create or replace function public.kitty_history_fixture_v1(actor text,operation text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare is_admin boolean;is_hr boolean;result jsonb;v_kind text:=payload->>'kind';
begin
 if actor is null or actor='' then raise exception 'UNAUTHENTICATED';end if;
 if operation<>'history' or v_kind is null or v_kind not in ('leave','correction') then raise exception 'INVALID_REQUEST';end if;
 is_admin:=exists(select 1 from kitty_history_fixture.admins where line_user_id=actor and active and upper(role)='ADMIN');
 is_hr:=not is_admin and exists(select 1 from kitty_history_fixture.hr_access where line_user_id=actor and status='APPROVED');
 if not is_admin and not is_hr then raise exception 'FORBIDDEN';end if;
 is_hr:=is_hr or (is_admin and coalesce(payload->>'previewRole','')='HR');
 select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) into result from (
  select x.created_at,x.item||jsonb_build_object('employee',jsonb_build_object('id',e.id,'employee_code',e.employee_code,'name',e.name)) item
  from (
   select r.employee_id,r.created_at,to_jsonb(r)||jsonb_build_object('sandbox',false,'history_source','live') item
   from kitty_history_fixture.requests r where r.status in ('APPROVED','REJECTED','CANCELLED') and r.kind=v_kind
   union all
   select r.employee_id,r.created_at,to_jsonb(r)||jsonb_build_object('kind','overtime','sandbox',false,'history_source','live') from kitty_history_fixture.ot r
   where v_kind='correction' and r.status in ('APPROVED','REJECTED','CANCELLED')
   union all
   select r.employee_id,r.created_at,to_jsonb(r)||jsonb_build_object('sandbox',true,'history_source','before_production') from kitty_history_fixture.old_requests r where r.kind=v_kind
   union all
   select r.employee_id,r.created_at,to_jsonb(r)||jsonb_build_object('kind','overtime','sandbox',true,'history_source','before_production') from kitty_history_fixture.old_ot r where v_kind='correction'
  ) x join kitty_history_fixture.employees e on e.id=x.employee_id
  where not is_hr or (coalesce(e.employee_code,'') ~* '^HO' and upper(coalesce(e.attendance_mode::text,'')) not in ('MULTI_BRANCH','DRIVER'))
  order by x.created_at desc limit 1000
 ) scoped;
 return jsonb_build_object('ok',true,'rows',result,'limit',1000);
end;$f$;
revoke all on function public.kitty_history_fixture_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_history_fixture_v1(text,text,jsonb) to service_role;
notify pgrst,'reload schema';


do $test$
declare result jsonb;
begin
 result:=public.kitty_history_fixture_v1('hr','history','{"kind":"correction"}');
 if jsonb_array_length(result->'rows')<>2 then raise exception 'HR history scope failed';end if;
 if exists(select 1 from jsonb_array_elements(result->'rows') r where r->'employee'->>'employee_code'<>'HO001') then raise exception 'HR leaked BA';end if;
 result:=public.kitty_history_fixture_v1('admin','history','{"kind":"correction"}');
 if jsonb_array_length(result->'rows')<>4 then raise exception 'Admin history missing';end if;
 result:=public.kitty_history_fixture_v1('admin','history','{"kind":"correction","previewRole":"HR"}');
 if jsonb_array_length(result->'rows')<>2 then raise exception 'Admin HR preview widened scope';end if;
 begin perform public.kitty_history_fixture_v1('employee','history','{"kind":"correction"}');raise exception 'Employee allowed';
 exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 if has_function_privilege('anon','public.kitty_history_fixture_v1(text,text,jsonb)','EXECUTE') then raise exception 'Anonymous access';end if;
end;$test$;
rollback;

