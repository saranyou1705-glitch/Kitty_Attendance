-- Explicit application only. Never copy kitty_staging rows.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create schema kitty_live;
revoke all on schema kitty_live from public,anon,authenticated;
create table kitty_live.hr_access(
 id uuid primary key default gen_random_uuid(),
 line_user_id text not null unique,
 name text not null check(length(btrim(name)) between 1 and 160),
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','REVOKED')),
 version integer not null default 1,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,reviewed_by uuid
);
create table kitty_live.access_audit(
 id bigint generated always as identity primary key,
 access_id uuid not null references kitty_live.hr_access(id),
 actor_line_user_id text not null,action text not null,
 before_value jsonb,after_value jsonb,created_at timestamptz not null default now()
);
alter table kitty_live.hr_access enable row level security;
alter table kitty_live.access_audit enable row level security;
revoke all on all tables in schema kitty_live from public,anon,authenticated;
revoke all on all sequences in schema kitty_live from public,anon,authenticated;

create function public.kitty_live_access_v1(actor text,operation text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare admin_id uuid;r kitty_live.hr_access%rowtype;before_row jsonb;
 display_name text;items jsonb;
begin
 if actor is null or actor='' then raise exception 'UNAUTHENTICATED';end if;
 if (select count(*) from public.admins where line_user_id=actor and active)>1 then raise exception 'AMBIGUOUS_IDENTITY';end if;
 select id into admin_id from public.admins where line_user_id=actor and active and upper(role)='ADMIN';
 if operation='identity' then
  select * into r from kitty_live.hr_access where line_user_id=actor;
  return jsonb_build_object('ok',true,'role',case when admin_id is not null then 'ADMIN' when r.status='APPROVED' then 'HR' else 'EMPLOYEE' end,
   'registration',case when r.id is null then null else jsonb_build_object('id',r.id,'name',r.name,'status',r.status,'version',r.version) end);
 end if;
 if operation='register' then
  if admin_id is not null then raise exception 'ALREADY_ADMIN';end if;
  if payload-array['name']<>'{}'::jsonb then raise exception 'INVALID_FIELDS';end if;
  display_name:=btrim(payload->>'name');
  if display_name is null or length(display_name) not between 1 and 160 then raise exception 'INVALID_NAME';end if;
  perform pg_advisory_xact_lock(hashtextextended('kitty-live-access:'||actor,0));
  select * into r from kitty_live.hr_access where line_user_id=actor;
  if r.id is null then
   insert into kitty_live.hr_access(line_user_id,name) values(actor,display_name) returning * into r;
   insert into kitty_live.access_audit(access_id,actor_line_user_id,action,after_value) values(r.id,actor,'REGISTER',to_jsonb(r));
  end if;
  return jsonb_build_object('ok',true,'registration',jsonb_build_object('id',r.id,'name',r.name,'status',r.status,'version',r.version));
 end if;
 if admin_id is null then raise exception 'ADMIN_REQUIRED';end if;
 if operation='list' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into items from kitty_live.hr_access x;
  return jsonb_build_object('ok',true,'registrations',items);
 end if;
 if operation not in ('grant','reject','revoke') then raise exception 'INVALID_OPERATION';end if;
 if payload-array['registrationId','version']<>'{}'::jsonb then raise exception 'INVALID_FIELDS';end if;
 select * into r from kitty_live.hr_access where id=(payload->>'registrationId')::uuid for update;
 if r.id is null then raise exception 'NOT_FOUND';end if;
 if r.line_user_id=actor then raise exception 'SELF_ROLE_CHANGE';end if;
 if coalesce((payload->>'version')::integer,0)<>r.version then raise exception 'STALE_REGISTRATION';end if;
 if operation in ('grant','reject') and r.status<>'PENDING' then raise exception 'ALREADY_REVIEWED';end if;
 if operation='revoke' and r.status<>'APPROVED' then raise exception 'NOT_APPROVED';end if;
 before_row:=to_jsonb(r);
 update kitty_live.hr_access set status=case operation when 'grant' then 'APPROVED' when 'reject' then 'REJECTED' else 'REVOKED' end,
 version=version+1,reviewed_at=now(),reviewed_by=admin_id where id=r.id returning * into r;
 insert into kitty_live.access_audit(access_id,actor_line_user_id,action,before_value,after_value) values(r.id,actor,upper(operation),before_row,to_jsonb(r));
 return jsonb_build_object('ok',true,'registration',to_jsonb(r));
end;$fn$;
revoke all on function public.kitty_live_access_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kitty_live_access_v1(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
