begin;
create schema kitty_personnel_fixture;
create schema kitty_personnel_people;
create table kitty_personnel_people.employees(id uuid,employee_code text,name text,line_user_id text,active boolean,attendance_mode text,department text,position text,start_date date);
create table kitty_personnel_people.admins(id uuid,line_user_id text,active boolean,role text);
insert into kitty_personnel_people.employees(id,employee_code,name,line_user_id,active,attendance_mode) values('10000000-0000-4000-8000-000000000001','HO001','Test Office','test-ho',true,'STANDARD'),('10000000-0000-4000-8000-000000000002','BA001','Test BA','test-ba',true,'MULTI_BRANCH');
insert into kitty_personnel_people.admins values('20000000-0000-4000-8000-000000000001','test-admin',true,'ADMIN'),('20000000-0000-4000-8000-000000000002','test-hr',true,'HR');
-- Personnel onboarding sandbox. No writes to public employee/schedule/auth tables.

set local lock_timeout='5s';
create table kitty_personnel_fixture.registrations(
 id uuid primary key default gen_random_uuid(),line_user_id text not null unique,
 name text not null check(length(btrim(name)) between 1 and 160),
 status text not null default 'PENDING' check(status in ('PENDING','READY')),
 created_at timestamptz not null default now()
);
create table kitty_personnel_fixture.personnel(
 id uuid primary key,employee_id uuid unique,registration_id uuid unique references kitty_personnel_fixture.registrations(id),
 employee_code text not null unique,name text not null,department text,position text,start_date date,
 weekly_dayoffs text[] not null default '{}',version integer not null default 1,
 updated_at timestamptz not null default now(),updated_by uuid not null,
 check(length(name) between 1 and 160),check(weekly_dayoffs <@ array['MON','TUE','WED','THU','FRI','SAT','SUN'])
);
create table kitty_personnel_fixture.registration_reads(
 registration_id uuid references kitty_personnel_fixture.registrations(id),admin_id uuid not null,
 primary key(registration_id,admin_id)
);
create table kitty_personnel_fixture.personnel_audit(
 id bigint generated always as identity primary key,profile_id uuid not null,actor_id uuid not null,
 before_value jsonb,after_value jsonb,created_at timestamptz not null default now()
);
alter table kitty_personnel_fixture.registrations enable row level security;
alter table kitty_personnel_fixture.personnel enable row level security;
alter table kitty_personnel_fixture.registration_reads enable row level security;
alter table kitty_personnel_fixture.personnel_audit enable row level security;
revoke all on kitty_personnel_fixture.registrations,kitty_personnel_fixture.personnel,kitty_personnel_fixture.registration_reads,kitty_personnel_fixture.personnel_audit from public,anon,authenticated;
revoke all on sequence kitty_personnel_fixture.personnel_audit_id_seq from public,anon,authenticated;

create function public.kitty_personnel_test_rpc(actor text,operation text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare m kitty_personnel_people.admins%rowtype;e kitty_personnel_people.employees%rowtype;r kitty_personnel_fixture.registrations%rowtype;
 p kitty_personnel_fixture.personnel%rowtype;old_value jsonb;is_hr boolean;rows jsonb;profiles jsonb;
 code text;full_name text;days text[];pid uuid;
begin
 if actor is null or actor='' then raise exception 'UNAUTHENTICATED';end if;
 if operation in ('register','mine') then
   if exists(select 1 from kitty_personnel_people.employees where line_user_id=actor) then raise exception 'ALREADY_EMPLOYEE';end if;
   if operation='register' then
     full_name:=btrim(payload->>'name');
     if full_name is null or length(full_name) not between 1 and 160 then raise exception 'INVALID_NAME';end if;
     insert into kitty_personnel_fixture.registrations(line_user_id,name) values(actor,full_name) on conflict(line_user_id) do nothing;
   end if;
   select * into r from kitty_personnel_fixture.registrations where line_user_id=actor;
   return jsonb_build_object('ok',true,'registration',case when r.id is null then null else jsonb_build_object('id',r.id,'name',r.name,'status',r.status) end,'sandbox',true);
 end if;
 if (select count(*) from kitty_personnel_people.admins where line_user_id=actor and active)<>1 then raise exception 'FORBIDDEN';end if;
 select * into m from kitty_personnel_people.admins where line_user_id=actor and active;
 is_hr:=upper(coalesce(m.role,''))='HR' or payload->>'previewRole'='HR';
 if operation='save' then perform pg_advisory_xact_lock(hashtextextended('kitty-staging-personnel',0));end if;
 if operation='list' then
   select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('unread',not exists(select 1 from kitty_personnel_fixture.registration_reads rr where rr.registration_id=x.id and rr.admin_id=m.id)) order by x.created_at desc),'[]') into rows from kitty_personnel_fixture.registrations x where x.status='PENDING';
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into profiles from kitty_personnel_fixture.personnel x
   left join kitty_personnel_people.employees emp on emp.id=x.employee_id
   where not coalesce(is_hr,false) or (x.employee_id is null and x.employee_code ~ '^HO[0-9]+$') or (emp.employee_code ~* '^HO' and upper(coalesce(emp.attendance_mode::text,'')) not in ('MULTI_BRANCH','DRIVER'));
   return jsonb_build_object('ok',true,'registrations',rows,'profiles',profiles,'sandbox',true);
 end if;
 if payload->>'employeeId' is not null and payload->>'profileId' is not null then raise exception 'INVALID_REQUEST';end if;
 if operation not in ('get','save','read') then raise exception 'INVALID_OPERATION';end if;
 if payload->>'employeeId' is not null then
   select * into e from kitty_personnel_people.employees where id=(payload->>'employeeId')::uuid;
   if e.id is null then raise exception 'NOT_FOUND';end if;
   if coalesce(is_hr,false) and (e.employee_code !~* '^HO' or upper(coalesce(e.attendance_mode::text,'')) in ('MULTI_BRANCH','DRIVER')) then raise exception 'FORBIDDEN';end if;
   select * into p from kitty_personnel_fixture.personnel where employee_id=e.id;
 elsif payload->>'profileId' is not null then
   select * into p from kitty_personnel_fixture.personnel where id=(payload->>'profileId')::uuid;
   if p.employee_id is not null then
     select * into e from kitty_personnel_people.employees where id=p.employee_id;
     if e.id is null then raise exception 'NOT_FOUND';end if;
   end if;
   if coalesce(is_hr,false) and ((p.employee_id is not null and (e.employee_code !~* '^HO' or upper(coalesce(e.attendance_mode::text,'')) in ('MULTI_BRANCH','DRIVER'))) or (p.employee_id is null and p.id is not null and p.employee_code !~ '^HO[0-9]+$')) then raise exception 'FORBIDDEN';end if;
 end if;
 if payload->>'registrationId' is not null then
   select * into r from kitty_personnel_fixture.registrations where id=(payload->>'registrationId')::uuid;
   if r.id is null then raise exception 'NOT_FOUND';end if;
   if e.id is not null or p.id is not null and p.registration_id is distinct from r.id then raise exception 'INVALID_REQUEST';end if;
   select * into p from kitty_personnel_fixture.personnel where registration_id=r.id;
 end if;
 if operation='read' then
   if r.id is null then raise exception 'NOT_FOUND';end if;
   insert into kitty_personnel_fixture.registration_reads values(r.id,m.id) on conflict do nothing;
   return jsonb_build_object('ok',true);
 end if;
 if p.registration_id is not null and r.id is null then select * into r from kitty_personnel_fixture.registrations where id=p.registration_id;end if;
 if operation='get' then
   return jsonb_build_object('ok',true,'profile',case when p.id is not null then to_jsonb(p) else jsonb_build_object(
   'employee_id',e.id,'registration_id',r.id,'name',coalesce(e.name,r.name,''),'employee_code',coalesce(e.employee_code,''),'department',e.department,'position',e.position,'start_date',e.start_date,'weekly_dayoffs','[]'::jsonb,'version',0) end,
   'line_user_id',coalesce(e.line_user_id,r.line_user_id),'sandbox',true);
 end if;
 -- Serialize all personnel writes, including code uniqueness checks against existing staff.
 perform pg_advisory_xact_lock(hashtextextended('kitty-staging-personnel',0));
 if p.id is not null then select * into p from kitty_personnel_fixture.personnel where id=p.id for update;end if;
 if coalesce((payload->>'version')::integer,-1)<>coalesce(p.version,0) then raise exception 'STALE_PROFILE';end if;
 code:=upper(btrim(payload->>'employee_code'));full_name:=btrim(payload->>'name');
 if code is null or code !~ '^[A-Z]{2,8}[0-9]{1,8}$' or full_name is null or length(full_name) not between 1 and 160 then raise exception 'INVALID_REQUEST';end if;
 if p.id is not null and code<>p.employee_code then raise exception 'CODE_IMMUTABLE';end if;
 if e.id is not null and code<>e.employee_code then raise exception 'CODE_IMMUTABLE';end if;
 if e.id is null and code !~ '^HO[0-9]+$' then raise exception 'HO_ONLY';end if;
 if exists(select 1 from kitty_personnel_people.employees where employee_code=code and (e.id is null or id<>e.id)) then raise exception 'DUPLICATE_CODE';end if;
 if jsonb_typeof(payload->'weekly_dayoffs') is distinct from 'array' then raise exception 'INVALID_DAYOFF';end if;
 select coalesce(array_agg(distinct v),'{}') into days from jsonb_array_elements_text(payload->'weekly_dayoffs') v;
 if not days <@ array['MON','TUE','WED','THU','FRI','SAT','SUN'] or array_position(days,null) is not null then raise exception 'INVALID_DAYOFF';end if;
 if length(coalesce(payload->>'department',''))>160 or length(coalesce(payload->>'position',''))>160 then raise exception 'INVALID_REQUEST';end if;
 old_value:=case when p.id is null then null else to_jsonb(p) end;
 pid:=coalesce(p.id,(payload->>'profileId')::uuid,gen_random_uuid());
 insert into kitty_personnel_fixture.personnel(id,employee_id,registration_id,employee_code,name,department,position,start_date,weekly_dayoffs,updated_by)
 values(pid,e.id,r.id,code,full_name,nullif(btrim(payload->>'department'),''),nullif(btrim(payload->>'position'),''),nullif(payload->>'start_date','')::date,days,m.id)
 on conflict(id) do update set name=excluded.name,department=excluded.department,position=excluded.position,start_date=excluded.start_date,weekly_dayoffs=excluded.weekly_dayoffs,version=kitty_personnel_fixture.personnel.version+1,updated_at=now(),updated_by=m.id
 returning * into p;
 if r.id is not null then update kitty_personnel_fixture.registrations set status='READY' where id=r.id;insert into kitty_personnel_fixture.registration_reads values(r.id,m.id) on conflict do nothing;end if;
 insert into kitty_personnel_fixture.personnel_audit(profile_id,actor_id,before_value,after_value) values(p.id,m.id,old_value,to_jsonb(p));
 return jsonb_build_object('ok',true,'profile',to_jsonb(p),'sandbox',true);
end;$f$;
revoke all on function public.kitty_personnel_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_personnel_test_rpc(text,text,jsonb) to service_role;



create table kitty_personnel_people.employee_weekly_dayoffs(employee_id uuid,iso_dow integer,active boolean);
-- Isolated onboarding authorization and employee self-service contacts. No production writes.

set local lock_timeout='5s';
create or replace function public.kitty_personnel_test_rpc(actor text,operation text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare m kitty_personnel_people.admins%rowtype;e kitty_personnel_people.employees%rowtype;r kitty_personnel_fixture.registrations%rowtype;
 p kitty_personnel_fixture.personnel%rowtype;old_value jsonb;is_hr boolean;rows jsonb;profiles jsonb;
 code text;full_name text;days text[];pid uuid;
begin
 if actor is null or actor='' then raise exception 'UNAUTHENTICATED';end if;
 if operation in ('register','mine') then
   if exists(select 1 from kitty_personnel_people.employees where line_user_id=actor) then raise exception 'ALREADY_EMPLOYEE';end if;
   if operation='register' then
     full_name:=btrim(payload->>'name');
     if full_name is null or length(full_name) not between 1 and 160 then raise exception 'INVALID_NAME';end if;
     insert into kitty_personnel_fixture.registrations(line_user_id,name) values(actor,full_name) on conflict(line_user_id) do nothing;
   end if;
   select * into r from kitty_personnel_fixture.registrations where line_user_id=actor;
   return jsonb_build_object('ok',true,'registration',case when r.id is null then null else jsonb_build_object('id',r.id,'name',r.name,'status',r.status) end,'sandbox',true);
 end if;
 if (select count(*) from kitty_personnel_people.admins where line_user_id=actor and active)<>1 then raise exception 'FORBIDDEN';end if;
 select * into m from kitty_personnel_people.admins where line_user_id=actor and active;
 is_hr:=upper(coalesce(m.role,''))='HR' or payload->>'previewRole'='HR';
 if operation='save' then perform pg_advisory_xact_lock(hashtextextended('kitty-staging-personnel',0));end if;
 if operation='list' then
   select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('unread',not exists(select 1 from kitty_personnel_fixture.registration_reads rr where rr.registration_id=x.id and rr.admin_id=m.id)) order by x.created_at desc),'[]') into rows from kitty_personnel_fixture.registrations x where x.status='PENDING';
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into profiles from kitty_personnel_fixture.personnel x
   left join kitty_personnel_people.employees emp on emp.id=x.employee_id
   where not coalesce(is_hr,false) or (x.employee_id is null and x.employee_code ~ '^HO[0-9]+$') or (emp.employee_code ~* '^HO' and upper(coalesce(emp.attendance_mode::text,'')) not in ('MULTI_BRANCH','DRIVER'));
   return jsonb_build_object('ok',true,'registrations',rows,'profiles',profiles,'sandbox',true);
 end if;
 if payload->>'employeeId' is not null and payload->>'profileId' is not null then raise exception 'INVALID_REQUEST';end if;
 if operation not in ('get','save','read') then raise exception 'INVALID_OPERATION';end if;
 if payload->>'employeeId' is not null then
   select * into e from kitty_personnel_people.employees where id=(payload->>'employeeId')::uuid;
   if e.id is null then raise exception 'NOT_FOUND';end if;
   if coalesce(is_hr,false) and (e.employee_code !~* '^HO' or upper(coalesce(e.attendance_mode::text,'')) in ('MULTI_BRANCH','DRIVER')) then raise exception 'FORBIDDEN';end if;
   select * into p from kitty_personnel_fixture.personnel where employee_id=e.id;
 elsif payload->>'profileId' is not null then
   select * into p from kitty_personnel_fixture.personnel where id=(payload->>'profileId')::uuid;
   if p.employee_id is not null then
     select * into e from kitty_personnel_people.employees where id=p.employee_id;
     if e.id is null then raise exception 'NOT_FOUND';end if;
   end if;
   if coalesce(is_hr,false) and ((p.employee_id is not null and (e.employee_code !~* '^HO' or upper(coalesce(e.attendance_mode::text,'')) in ('MULTI_BRANCH','DRIVER'))) or (p.employee_id is null and p.id is not null and p.employee_code !~ '^HO[0-9]+$')) then raise exception 'FORBIDDEN';end if;
 end if;
 if payload->>'registrationId' is not null then
   select * into r from kitty_personnel_fixture.registrations where id=(payload->>'registrationId')::uuid;
   if r.id is null then raise exception 'NOT_FOUND';end if;
   if e.id is not null or p.id is not null and p.registration_id is distinct from r.id then raise exception 'INVALID_REQUEST';end if;
   select * into p from kitty_personnel_fixture.personnel where registration_id=r.id;
 end if;
 if operation='read' then
   if r.id is null then raise exception 'NOT_FOUND';end if;
   insert into kitty_personnel_fixture.registration_reads values(r.id,m.id) on conflict do nothing;
   return jsonb_build_object('ok',true);
 end if;
 if p.registration_id is not null and r.id is null then select * into r from kitty_personnel_fixture.registrations where id=p.registration_id;end if;
 if coalesce(is_hr,false) and e.id is null and r.id is null and p.id is null then raise exception 'REGISTRATION_REQUIRED';end if;
 if operation='save' and r.id is not null and r.status='PENDING' and payload->>'approveRegistration' is distinct from 'true' then raise exception 'APPROVAL_REQUIRED';end if;
 if operation='get' then
   return jsonb_build_object('ok',true,'profile',case when p.id is not null then to_jsonb(p) else jsonb_build_object(
   'employee_id',e.id,'registration_id',r.id,'name',coalesce(e.name,r.name,''),'employee_code',coalesce(e.employee_code,''),'department',e.department,'position',e.position,'start_date',e.start_date,'weekly_dayoffs','[]'::jsonb,'version',0) end,
   'line_user_id',coalesce(e.line_user_id,r.line_user_id),'sandbox',true);
 end if;
 -- Serialize all personnel writes, including code uniqueness checks against existing staff.
 perform pg_advisory_xact_lock(hashtextextended('kitty-staging-personnel',0));
 if p.id is not null then select * into p from kitty_personnel_fixture.personnel where id=p.id for update;end if;
 if coalesce((payload->>'version')::integer,-1)<>coalesce(p.version,0) then raise exception 'STALE_PROFILE';end if;
 code:=upper(btrim(payload->>'employee_code'));full_name:=btrim(payload->>'name');
 if code is null or code !~ '^[A-Z]{2,8}[0-9]{1,8}$' or full_name is null or length(full_name) not between 1 and 160 then raise exception 'INVALID_REQUEST';end if;
 if p.id is not null and code<>p.employee_code then raise exception 'CODE_IMMUTABLE';end if;
 if e.id is not null and code<>e.employee_code then raise exception 'CODE_IMMUTABLE';end if;
 if e.id is null and code !~ '^HO[0-9]+$' then raise exception 'HO_ONLY';end if;
 if exists(select 1 from kitty_personnel_people.employees where employee_code=code and (e.id is null or id<>e.id)) then raise exception 'DUPLICATE_CODE';end if;
 if jsonb_typeof(payload->'weekly_dayoffs') is distinct from 'array' then raise exception 'INVALID_DAYOFF';end if;
 select coalesce(array_agg(distinct v),'{}') into days from jsonb_array_elements_text(payload->'weekly_dayoffs') v;
 if not days <@ array['MON','TUE','WED','THU','FRI','SAT','SUN'] or array_position(days,null) is not null then raise exception 'INVALID_DAYOFF';end if;
 if length(coalesce(payload->>'department',''))>160 or length(coalesce(payload->>'position',''))>160 then raise exception 'INVALID_REQUEST';end if;
 old_value:=case when p.id is null then null else to_jsonb(p) end;
 pid:=coalesce(p.id,(payload->>'profileId')::uuid,gen_random_uuid());
 insert into kitty_personnel_fixture.personnel(id,employee_id,registration_id,employee_code,name,department,position,start_date,weekly_dayoffs,updated_by)
 values(pid,e.id,r.id,code,full_name,nullif(btrim(payload->>'department'),''),nullif(btrim(payload->>'position'),''),nullif(payload->>'start_date','')::date,days,m.id)
 on conflict(id) do update set name=excluded.name,department=excluded.department,position=excluded.position,start_date=excluded.start_date,weekly_dayoffs=excluded.weekly_dayoffs,version=kitty_personnel_fixture.personnel.version+1,updated_at=now(),updated_by=m.id
 returning * into p;
 if r.id is not null then update kitty_personnel_fixture.registrations set status='READY' where id=r.id;insert into kitty_personnel_fixture.registration_reads values(r.id,m.id) on conflict do nothing;end if;
 insert into kitty_personnel_fixture.personnel_audit(profile_id,actor_id,before_value,after_value) values(p.id,m.id,old_value,to_jsonb(p));
 return jsonb_build_object('ok',true,'profile',to_jsonb(p),'sandbox',true);
end;$f$;
revoke all on function public.kitty_personnel_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_personnel_test_rpc(text,text,jsonb) to service_role;

create table kitty_personnel_fixture.employee_contacts(
 employee_id uuid primary key,phone text not null default '',email text not null default '',
 version integer not null default 1,updated_at timestamptz not null default now()
);
alter table kitty_personnel_fixture.employee_contacts enable row level security;
revoke all on kitty_personnel_fixture.employee_contacts from public,anon,authenticated;
create function public.kitty_self_test_rpc(actor text,operation text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare e kitty_personnel_people.employees%rowtype;p kitty_personnel_fixture.personnel%rowtype;c kitty_personnel_fixture.employee_contacts%rowtype;
 phone_value text;email_value text;days jsonb;
begin
 if actor is null or actor='' then raise exception 'UNAUTHENTICATED';end if;
 if (select count(*) from kitty_personnel_people.employees where line_user_id=actor and active)<>1 then raise exception 'FORBIDDEN';end if;
 select * into e from kitty_personnel_people.employees where line_user_id=actor and active;
 if operation not in ('get','save') then raise exception 'INVALID_OPERATION';end if;
 perform pg_advisory_xact_lock(hashtextextended('kitty-self-profile-'||e.id::text,0));
 select * into c from kitty_personnel_fixture.employee_contacts where employee_id=e.id;
 if operation='save' then
   if payload - array['phone','email','version'] <> '{}'::jsonb then raise exception 'INVALID_FIELDS';end if;
   if coalesce((payload->>'version')::integer,-1)<>coalesce(c.version,0) then raise exception 'STALE_PROFILE';end if;
   phone_value:=btrim(coalesce(payload->>'phone',''));email_value:=btrim(coalesce(payload->>'email',''));
   if length(phone_value)>30 or (phone_value<>'' and phone_value !~ '^[+0-9() .-]{6,30}$') then raise exception 'INVALID_PHONE';end if;
   if length(email_value)>254 or (email_value<>'' and email_value !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then raise exception 'INVALID_EMAIL';end if;
   insert into kitty_personnel_fixture.employee_contacts(employee_id,phone,email) values(e.id,phone_value,email_value)
   on conflict(employee_id) do update set phone=excluded.phone,email=excluded.email,version=kitty_personnel_fixture.employee_contacts.version+1,updated_at=now() returning * into c;
 end if;
 select * into p from kitty_personnel_fixture.personnel where employee_id=e.id;
 select coalesce(jsonb_agg((array['MON','TUE','WED','THU','FRI','SAT','SUN'])[iso_dow] order by iso_dow),'[]') into days
 from kitty_personnel_people.employee_weekly_dayoffs where employee_id=e.id and active and iso_dow between 1 and 7;
 return jsonb_build_object('ok',true,'sandbox',true,'version',coalesce(c.version,0),'employee',
 jsonb_build_object('id',e.id,'employee_code',e.employee_code,'name',coalesce(p.name,e.name),'department',coalesce(p.department,e.department),
 'position',coalesce(p.position,e.position),'start_date',coalesce(p.start_date,e.start_date),'active',e.active,'attendance_mode',e.attendance_mode,
 'line_user_id',e.line_user_id,'weekly_dayoffs',case when p.id is not null then to_jsonb(p.weekly_dayoffs) else days end,
 'phone',coalesce(c.phone,to_jsonb(e)->>'phone',''),'email',coalesce(c.email,to_jsonb(e)->>'email','')));
end;$f$;
revoke all on function public.kitty_self_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_self_test_rpc(text,text,jsonb) to service_role;


do $test$
declare r jsonb;p jsonb;rid text;before_staff jsonb;
begin
 select jsonb_agg(to_jsonb(e)) into before_staff from kitty_personnel_people.employees e;
 r:=public.kitty_personnel_test_rpc('new-person','register','{"name":"New Person"}');rid:=r->'registration'->>'id';
 assert r->'registration'->>'status'='PENDING';
 r:=public.kitty_personnel_test_rpc('new-person','register','{"name":"Second submit"}');assert r->'registration'->>'id'=rid;
 r:=public.kitty_personnel_test_rpc('test-hr','list');assert jsonb_array_length(r->'registrations')=1;assert (r->'registrations'->0->>'unread')::boolean;
 perform public.kitty_personnel_test_rpc('test-hr','read',jsonb_build_object('registrationId',rid));
 r:=public.kitty_personnel_test_rpc('test-hr','list');assert not (r->'registrations'->0->>'unread')::boolean;
 begin perform public.kitty_personnel_test_rpc('new-person','save','{}');raise exception 'Expected forbidden';
 exception when raise_exception then assert sqlerrm='FORBIDDEN';end;
 begin perform public.kitty_personnel_test_rpc('test-hr','get','{"employeeId":"10000000-0000-4000-8000-000000000002"}');raise exception 'Expected forbidden BA';
 exception when raise_exception then assert sqlerrm='FORBIDDEN';end;
 p:=jsonb_build_object('registrationId',rid,'profileId','30000000-0000-4000-8000-000000000001','approveRegistration',true,'version',0,'employee_code','HO099','name','New Person','weekly_dayoffs',jsonb_build_array('SAT','SUN'));
 r:=public.kitty_personnel_test_rpc('test-hr','save',p);assert r->'profile'->'weekly_dayoffs'='["SAT","SUN"]'::jsonb;
 r:=public.kitty_personnel_test_rpc('new-person','mine');assert r->'registration'->>'status'='READY';
 r:=public.kitty_personnel_test_rpc('test-hr','list');assert jsonb_array_length(r->'registrations')=0;
 begin perform public.kitty_personnel_test_rpc('test-hr','save',p);raise exception 'Expected stale';exception when raise_exception then assert sqlerrm='STALE_PROFILE';end;
 p:='{"employeeId":"10000000-0000-4000-8000-000000000001","version":0,"employee_code":"HO001","name":"Changed in sandbox","weekly_dayoffs":["MON"]}';
 r:=public.kitty_personnel_test_rpc('test-hr','save',p);
 assert r->'profile'->>'name'='Changed in sandbox';assert r->'profile'->'weekly_dayoffs'='["MON"]'::jsonb;
 begin perform public.kitty_personnel_test_rpc('test-hr','save',p||'{"profileId":"30000000-0000-4000-8000-000000000001"}');raise exception 'Expected mixed target rejection';
 exception when raise_exception then assert sqlerrm='INVALID_REQUEST';end;
 begin perform public.kitty_personnel_test_rpc('test-hr','save',p||'{"version":1,"weekly_dayoffs":["BOGUS"]}');raise exception 'Expected day rejection';
 exception when raise_exception then assert sqlerrm='INVALID_DAYOFF';end;
 assert (select jsonb_agg(to_jsonb(e)) from kitty_personnel_people.employees e)=before_staff;
 assert (select count(*) from kitty_personnel_fixture.personnel_audit)=2;
 assert not has_function_privilege('anon','public.kitty_personnel_test_rpc(text,text,jsonb)','execute');
end;$test$;


do $test$
declare r jsonb;
begin
 begin perform public.kitty_personnel_test_rpc('test-hr','get','{}');raise exception 'Expected registration required';exception when raise_exception then assert sqlerrm='REGISTRATION_REQUIRED';end;
 begin perform public.kitty_personnel_test_rpc('test-hr','save','{"profileId":"40000000-0000-4000-8000-000000000001","version":0,"employee_code":"HO100","name":"Bypass","weekly_dayoffs":[]}');raise exception 'Expected rejection';exception when raise_exception then assert sqlerrm='REGISTRATION_REQUIRED';end;
 r:=public.kitty_personnel_test_rpc('new-pending','register','{"name":"Applicant"}');
 begin perform public.kitty_personnel_test_rpc('test-hr','save',jsonb_build_object('registrationId',r->'registration'->>'id','version',0,'employee_code','HO101','name','Applicant','weekly_dayoffs','[]'::jsonb));raise exception 'Expected approval';exception when raise_exception then assert sqlerrm='APPROVAL_REQUIRED';end;
 r:=public.kitty_self_test_rpc('test-ho','get');assert r->'employee'->>'employee_code'='HO001';
 r:=public.kitty_self_test_rpc('test-ho','save','{"phone":"0812345678","email":"person@example.com","version":0}');
 assert r->'employee'->>'phone'='0812345678';assert r->>'version'='1';
 begin perform public.kitty_self_test_rpc('test-ho','save','{"employeeId":"victim","phone":"0812345678","version":1}');raise exception 'Expected fields rejection';exception when raise_exception then assert sqlerrm='INVALID_FIELDS';end;
 begin perform public.kitty_self_test_rpc('test-ho','save','{"phone":"0812345678","email":"bad","version":1}');raise exception 'Expected invalid email';exception when raise_exception then assert sqlerrm='INVALID_EMAIL';end;
 begin perform public.kitty_self_test_rpc('test-ho','save','{"phone":"","email":"","version":0}');raise exception 'Expected stale';exception when raise_exception then assert sqlerrm='STALE_PROFILE';end;
 begin perform public.kitty_self_test_rpc('unregistered','get');raise exception 'Expected forbidden';exception when raise_exception then assert sqlerrm='FORBIDDEN';end;
 r:=public.kitty_self_test_rpc('test-ba','get');assert r->'employee'->>'phone'='';
 assert (select name from kitty_personnel_people.employees where line_user_id='test-ho')='Test Office';
 assert not has_function_privilege('anon','public.kitty_self_test_rpc(text,text,jsonb)','execute');
end;$test$;
rollback;
