-- Personnel onboarding sandbox. No writes to public employee/schedule/auth tables.
begin;
set local lock_timeout='5s';
create table kitty_staging.registrations(
 id uuid primary key default gen_random_uuid(),line_user_id text not null unique,
 name text not null check(length(btrim(name)) between 1 and 160),
 status text not null default 'PENDING' check(status in ('PENDING','READY')),
 created_at timestamptz not null default now()
);
create table kitty_staging.personnel(
 id uuid primary key,employee_id uuid unique,registration_id uuid unique references kitty_staging.registrations(id),
 employee_code text not null unique,name text not null,department text,position text,start_date date,
 weekly_dayoffs text[] not null default '{}',version integer not null default 1,
 updated_at timestamptz not null default now(),updated_by uuid not null,
 check(length(name) between 1 and 160),check(weekly_dayoffs <@ array['MON','TUE','WED','THU','FRI','SAT','SUN'])
);
create table kitty_staging.registration_reads(
 registration_id uuid references kitty_staging.registrations(id),admin_id uuid not null,
 primary key(registration_id,admin_id)
);
create table kitty_staging.personnel_audit(
 id bigint generated always as identity primary key,profile_id uuid not null,actor_id uuid not null,
 before_value jsonb,after_value jsonb,created_at timestamptz not null default now()
);
alter table kitty_staging.registrations enable row level security;
alter table kitty_staging.personnel enable row level security;
alter table kitty_staging.registration_reads enable row level security;
alter table kitty_staging.personnel_audit enable row level security;
revoke all on kitty_staging.registrations,kitty_staging.personnel,kitty_staging.registration_reads,kitty_staging.personnel_audit from public,anon,authenticated;
revoke all on sequence kitty_staging.personnel_audit_id_seq from public,anon,authenticated;

create function public.kitty_staging_personnel_v1(actor text,operation text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare m public.admins%rowtype;e public.employees%rowtype;r kitty_staging.registrations%rowtype;
 p kitty_staging.personnel%rowtype;old_value jsonb;is_hr boolean;rows jsonb;profiles jsonb;
 code text;full_name text;days text[];pid uuid;
begin
 if actor is null or actor='' then raise exception 'UNAUTHENTICATED';end if;
 if operation in ('register','mine') then
   if exists(select 1 from public.employees where line_user_id=actor) then raise exception 'ALREADY_EMPLOYEE';end if;
   if operation='register' then
     full_name:=btrim(payload->>'name');
     if full_name is null or length(full_name) not between 1 and 160 then raise exception 'INVALID_NAME';end if;
     insert into kitty_staging.registrations(line_user_id,name) values(actor,full_name) on conflict(line_user_id) do nothing;
   end if;
   select * into r from kitty_staging.registrations where line_user_id=actor;
   return jsonb_build_object('ok',true,'registration',case when r.id is null then null else jsonb_build_object('id',r.id,'name',r.name,'status',r.status) end,'sandbox',true);
 end if;
 if (select count(*) from public.admins where line_user_id=actor and active)<>1 then raise exception 'FORBIDDEN';end if;
 select * into m from public.admins where line_user_id=actor and active;
 is_hr:=upper(coalesce(m.role,''))='HR' or payload->>'previewRole'='HR';
 if operation='save' then perform pg_advisory_xact_lock(hashtextextended('kitty-staging-personnel',0));end if;
 if operation='list' then
   select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('unread',not exists(select 1 from kitty_staging.registration_reads rr where rr.registration_id=x.id and rr.admin_id=m.id)) order by x.created_at desc),'[]') into rows from kitty_staging.registrations x where x.status='PENDING';
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into profiles from kitty_staging.personnel x
   left join public.employees emp on emp.id=x.employee_id
   where not coalesce(is_hr,false) or (x.employee_id is null and x.employee_code ~ '^HO[0-9]+$') or (emp.employee_code ~* '^HO' and upper(coalesce(emp.attendance_mode::text,'')) not in ('MULTI_BRANCH','DRIVER'));
   return jsonb_build_object('ok',true,'registrations',rows,'profiles',profiles,'sandbox',true);
 end if;
 if payload->>'employeeId' is not null and payload->>'profileId' is not null then raise exception 'INVALID_REQUEST';end if;
 if operation not in ('get','save','read') then raise exception 'INVALID_OPERATION';end if;
 if payload->>'employeeId' is not null then
   select * into e from public.employees where id=(payload->>'employeeId')::uuid;
   if e.id is null then raise exception 'NOT_FOUND';end if;
   if coalesce(is_hr,false) and (e.employee_code !~* '^HO' or upper(coalesce(e.attendance_mode::text,'')) in ('MULTI_BRANCH','DRIVER')) then raise exception 'FORBIDDEN';end if;
   select * into p from kitty_staging.personnel where employee_id=e.id;
 elsif payload->>'profileId' is not null then
   select * into p from kitty_staging.personnel where id=(payload->>'profileId')::uuid;
   if p.employee_id is not null then
     select * into e from public.employees where id=p.employee_id;
     if e.id is null then raise exception 'NOT_FOUND';end if;
   end if;
   if coalesce(is_hr,false) and ((p.employee_id is not null and (e.employee_code !~* '^HO' or upper(coalesce(e.attendance_mode::text,'')) in ('MULTI_BRANCH','DRIVER'))) or (p.employee_id is null and p.id is not null and p.employee_code !~ '^HO[0-9]+$')) then raise exception 'FORBIDDEN';end if;
 end if;
 if payload->>'registrationId' is not null then
   select * into r from kitty_staging.registrations where id=(payload->>'registrationId')::uuid;
   if r.id is null then raise exception 'NOT_FOUND';end if;
   if e.id is not null or p.id is not null and p.registration_id is distinct from r.id then raise exception 'INVALID_REQUEST';end if;
   select * into p from kitty_staging.personnel where registration_id=r.id;
 end if;
 if operation='read' then
   if r.id is null then raise exception 'NOT_FOUND';end if;
   insert into kitty_staging.registration_reads values(r.id,m.id) on conflict do nothing;
   return jsonb_build_object('ok',true);
 end if;
 if p.registration_id is not null and r.id is null then select * into r from kitty_staging.registrations where id=p.registration_id;end if;
 if operation='get' then
   return jsonb_build_object('ok',true,'profile',case when p.id is not null then to_jsonb(p) else jsonb_build_object(
   'employee_id',e.id,'registration_id',r.id,'name',coalesce(e.name,r.name,''),'employee_code',coalesce(e.employee_code,''),'department',e.department,'position',e.position,'start_date',e.start_date,'weekly_dayoffs','[]'::jsonb,'version',0) end,
   'line_user_id',coalesce(e.line_user_id,r.line_user_id),'sandbox',true);
 end if;
 -- Serialize all personnel writes, including code uniqueness checks against existing staff.
 perform pg_advisory_xact_lock(hashtextextended('kitty-staging-personnel',0));
 if p.id is not null then select * into p from kitty_staging.personnel where id=p.id for update;end if;
 if coalesce((payload->>'version')::integer,-1)<>coalesce(p.version,0) then raise exception 'STALE_PROFILE';end if;
 code:=upper(btrim(payload->>'employee_code'));full_name:=btrim(payload->>'name');
 if code is null or code !~ '^[A-Z]{2,8}[0-9]{1,8}$' or full_name is null or length(full_name) not between 1 and 160 then raise exception 'INVALID_REQUEST';end if;
 if p.id is not null and code<>p.employee_code then raise exception 'CODE_IMMUTABLE';end if;
 if e.id is not null and code<>e.employee_code then raise exception 'CODE_IMMUTABLE';end if;
 if e.id is null and code !~ '^HO[0-9]+$' then raise exception 'HO_ONLY';end if;
 if exists(select 1 from public.employees where employee_code=code and (e.id is null or id<>e.id)) then raise exception 'DUPLICATE_CODE';end if;
 if jsonb_typeof(payload->'weekly_dayoffs') is distinct from 'array' then raise exception 'INVALID_DAYOFF';end if;
 select coalesce(array_agg(distinct v),'{}') into days from jsonb_array_elements_text(payload->'weekly_dayoffs') v;
 if not days <@ array['MON','TUE','WED','THU','FRI','SAT','SUN'] or array_position(days,null) is not null then raise exception 'INVALID_DAYOFF';end if;
 if length(coalesce(payload->>'department',''))>160 or length(coalesce(payload->>'position',''))>160 then raise exception 'INVALID_REQUEST';end if;
 old_value:=case when p.id is null then null else to_jsonb(p) end;
 pid:=coalesce(p.id,(payload->>'profileId')::uuid,gen_random_uuid());
 insert into kitty_staging.personnel(id,employee_id,registration_id,employee_code,name,department,position,start_date,weekly_dayoffs,updated_by)
 values(pid,e.id,r.id,code,full_name,nullif(btrim(payload->>'department'),''),nullif(btrim(payload->>'position'),''),nullif(payload->>'start_date','')::date,days,m.id)
 on conflict(id) do update set name=excluded.name,department=excluded.department,position=excluded.position,start_date=excluded.start_date,weekly_dayoffs=excluded.weekly_dayoffs,version=kitty_staging.personnel.version+1,updated_at=now(),updated_by=m.id
 returning * into p;
 if r.id is not null then update kitty_staging.registrations set status='READY' where id=r.id;insert into kitty_staging.registration_reads values(r.id,m.id) on conflict do nothing;end if;
 insert into kitty_staging.personnel_audit(profile_id,actor_id,before_value,after_value) values(p.id,m.id,old_value,to_jsonb(p));
 return jsonb_build_object('ok',true,'profile',to_jsonb(p),'sandbox',true);
end;$f$;
revoke all on function public.kitty_staging_personnel_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_staging_personnel_v1(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
