begin;
set local lock_timeout='5s';
create table if not exists kitty_live.employee_activations(
 registration_id uuid primary key,employee_id uuid not null unique,actor_line_user_id text not null,
 office_id uuid not null,created_at timestamptz not null default now(),execution_source text not null default 'HR_UI'
);
alter table kitty_live.employee_activations enable row level security;
revoke all on kitty_live.employee_activations from public,anon,authenticated;
create or replace function public.kitty_live_activate_employee(actor text,payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare r kitty_staging.registrations%rowtype;p kitty_staging.personnel%rowtype;
 e public.employees%rowtype;office uuid;day text;rid uuid;
begin
 if actor is null or not (
 exists(select 1 from public.admins where line_user_id=actor and active and upper(role)='ADMIN')
 or exists(select 1 from kitty_live.hr_access where line_user_id=actor and status='APPROVED')
 ) then raise exception 'FORBIDDEN';end if;
 if exists(select 1 from jsonb_object_keys(payload) k where k not in ('registrationId','officeId','version','previewRole')) then raise exception 'INVALID_FIELDS';end if;
 rid:=(payload->>'registrationId')::uuid;office:=(payload->>'officeId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('kitty-staging-personnel',0));
 select * into r from kitty_staging.registrations where id=rid for update;
 select * into p from kitty_staging.personnel where registration_id=rid for update;
 if r.id is null or r.status<>'READY' or p.id is null then raise exception 'APPROVAL_REQUIRED';end if;
 if p.employee_code !~ '^HO[0-9]+$' then raise exception 'HO_ONLY';end if;
 if not exists(select 1 from public.offices where id=office and active) then raise exception 'OFFICE_REQUIRED';end if;
 if exists(select 1 from kitty_live.employee_activations where registration_id=rid) then
   return jsonb_build_object('ok',true,'employeeId',(select employee_id from kitty_live.employee_activations where registration_id=rid),'replayed',true);
 end if;
 if p.version is distinct from (payload->>'version')::integer then raise exception 'STALE_PROFILE';end if;
 if p.employee_id is not null or exists(select 1 from public.employees where line_user_id=r.line_user_id or employee_code=p.employee_code) then raise exception 'EMPLOYEE_CONFLICT';end if;
 if r.line_user_id !~ '^U[0-9a-f]{32}$' then raise exception 'INVALID_LINE_ID';end if;
 insert into public.employees(employee_code,name,line_user_id,department,position,start_date,assigned_office_id,attendance_mode,active,require_break_clock,allow_any_office)
 values(p.employee_code,p.name,r.line_user_id,p.department,p.position,p.start_date,office,'STANDARD',true,true,false) returning * into e;
 foreach day in array p.weekly_dayoffs loop
   insert into public.employee_weekly_dayoffs(employee_id,iso_dow,active) values(e.id,array_position(array['MON','TUE','WED','THU','FRI','SAT','SUN'],day),true);
 end loop;
 -- Create schedules only for this new employee; never create clock events.
 insert into public.employee_schedules(employee_id,work_date,office_id,schedule_status,required_hours)
 select e.id,d::date,office,
   (case when extract(isodow from d)::integer=any(select iso_dow from public.employee_weekly_dayoffs where employee_id=e.id and active) then 'OFF' else 'WORK' end)::public.schedule_status,
   case when extract(isodow from d)::integer=any(select iso_dow from public.employee_weekly_dayoffs where employee_id=e.id and active) then 0 else 9 end
 from generate_series(greatest(coalesce(p.start_date,(now() at time zone 'Asia/Bangkok')::date),(now() at time zone 'Asia/Bangkok')::date),((now() at time zone 'Asia/Bangkok')::date+interval '2 months'),interval '1 day') d
 on conflict(employee_id,work_date) do nothing;
 update kitty_staging.personnel set employee_id=e.id,version=version+1,updated_at=now() where id=p.id;
 insert into kitty_live.employee_activations(registration_id,employee_id,actor_line_user_id,office_id) values(rid,e.id,actor,office);
 return jsonb_build_object('ok',true,'employeeId',e.id);
end;$f$;
revoke all on function public.kitty_live_activate_employee(text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_live_activate_employee(text,jsonb) to service_role;
create table if not exists kitty_live.employee_office_audit(
 id bigint generated always as identity primary key,employee_id uuid not null,
 actor_line_user_id text not null,old_office_id uuid,new_office_id uuid not null,created_at timestamptz not null default now()
);
alter table kitty_live.employee_office_audit enable row level security;
revoke all on kitty_live.employee_office_audit from public,anon,authenticated;
create or replace function public.kitty_live_employee_office(actor text,payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare e public.employees%rowtype; office uuid; is_admin boolean;
begin
 is_admin:=exists(select 1 from public.admins where line_user_id=actor and active and upper(role)='ADMIN');
 if actor is null or not (is_admin or exists(select 1 from kitty_live.hr_access where line_user_id=actor and status='APPROVED')) then raise exception 'FORBIDDEN';end if;
 if payload-array['employeeId','officeId','previousOfficeId','previewRole']<>'{}'::jsonb then raise exception 'INVALID_FIELDS';end if;
 select * into e from public.employees where id=(payload->>'employeeId')::uuid for update;
 if e.id is null then raise exception 'NOT_FOUND';end if;
 if (not is_admin or payload->>'previewRole'='HR') and e.employee_code !~ '^HO[0-9]+$' then raise exception 'FORBIDDEN';end if;
 if payload ? 'officeId' then
  office:=(payload->>'officeId')::uuid;
  if not exists(select 1 from public.offices where id=office and active) then raise exception 'OFFICE_REQUIRED';end if;
  if e.assigned_office_id is distinct from (payload->>'previousOfficeId')::uuid then raise exception 'STALE_PROFILE';end if;
  update public.employees set assigned_office_id=office where id=e.id;
  update public.employee_schedules s set office_id=office,updated_at=now()
   where s.employee_id=e.id and s.work_date>=(now() at time zone 'Asia/Bangkok')::date
   and s.office_id is not distinct from e.assigned_office_id
   and not exists(select 1 from public.attendance_events a where a.employee_id=e.id and a.work_date=s.work_date);
  insert into kitty_live.employee_office_audit(employee_id,actor_line_user_id,old_office_id,new_office_id) values(e.id,actor,e.assigned_office_id,office);
  e.assigned_office_id:=office;
 end if;
 return jsonb_build_object('ok',true,'officeId',e.assigned_office_id);
end;$f$;
revoke all on function public.kitty_live_employee_office(text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_live_employee_office(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
