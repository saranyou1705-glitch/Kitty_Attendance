-- STAGING ONLY. Review and apply to a separate staging database first.
-- This migration does not alter attendance_events, daily_attendance,
-- recalculate_daily, LINE reports, or existing BA/Driver rules.

create table if not exists leave_requests_v2 (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  leave_date date not null,
  duration text not null check (duration in ('FULL_DAY','HALF_DAY_AM','HALF_DAY_PM')),
  required_net_minutes integer not null default 0,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  reason text,
  reviewed_by_line_user_id text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint half_day_requires_four_net_hours check (
    (duration = 'FULL_DAY' and required_net_minutes = 0) or
    (duration in ('HALF_DAY_AM','HALF_DAY_PM') and required_net_minutes = 240)
  )
);

create table if not exists attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  work_date date not null,
  requested_event_type text not null,
  requested_event_at timestamptz not null,
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  approved_sequence_in_month integer,
  deduction_amount numeric(10,2) not null default 0,
  reviewed_by_line_user_id text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approved_sequence_consistency check (
    (status <> 'APPROVED' and approved_sequence_in_month is null and deduction_amount = 0) or
    (status = 'APPROVED' and approved_sequence_in_month is not null and
      deduction_amount = case when approved_sequence_in_month >= 3 then 200 else 0 end)
  )
);

create index if not exists attendance_correction_employee_month_idx
  on attendance_correction_requests (employee_id, work_date, status);

create or replace function assign_attendance_correction_penalty()
returns trigger
language plpgsql
as $$
declare
  month_start date;
  next_sequence integer;
begin
  if new.status = 'APPROVED' and old.status is distinct from 'APPROVED' then
    month_start := date_trunc('month', new.work_date)::date;

    -- Serialize approvals for the same employee to prevent duplicate sequence numbers.
    perform pg_advisory_xact_lock(hashtext(new.employee_id::text || month_start::text));

    select count(*) + 1 into next_sequence
    from attendance_correction_requests
    where employee_id = new.employee_id
      and status = 'APPROVED'
      and work_date >= month_start
      and work_date < (month_start + interval '1 month')::date
      and id <> new.id;

    new.approved_sequence_in_month := next_sequence;
    new.deduction_amount := case when next_sequence >= 3 then 200 else 0 end;
    new.reviewed_at := coalesce(new.reviewed_at, now());
  elsif new.status in ('REJECTED','CANCELLED') then
    new.approved_sequence_in_month := null;
    new.deduction_amount := 0;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists attendance_correction_penalty_trigger
  on attendance_correction_requests;
create trigger attendance_correction_penalty_trigger
before update of status on attendance_correction_requests
for each row execute function assign_attendance_correction_penalty();

create table if not exists time_compensation_ledger (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  source_work_date date not null,
  target_work_date date not null,
  source_kind text not null check (source_kind in ('OVER','SHORT')),
  source_minutes integer not null check (source_minutes > 0),
  applied_minutes integer not null default 0 check (applied_minutes >= 0),
  outcome text not null default 'PENDING' check (
    outcome in ('PENDING','APPLIED','EXPIRED','DEDUCTION_PENDING')
  ),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (employee_id, source_work_date, source_kind),
  constraint compensation_only_next_workday check (target_work_date > source_work_date),
  constraint applied_not_over_source check (applied_minutes <= source_minutes)
);

create table if not exists hr_monthly_summary_exclusions (
  employee_id uuid primary key references employees(id),
  reason text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- The exclusions are stored by employee ID, not by display name at report time.
insert into hr_monthly_summary_exclusions (employee_id, reason)
select id, 'Excluded from HR Monthly Summary by policy'
from employees
where lower(name) like 'shane%' or lower(name) like 'peet%'
on conflict (employee_id) do update set active = true, reason = excluded.reason;

create or replace view attendance_correction_monthly_notes as
select
  employee_id,
  date_trunc('month', work_date)::date as month_start,
  count(*) filter (where status = 'APPROVED') as approved_count,
  coalesce(sum(deduction_amount) filter (where status = 'APPROVED'), 0) as deduction_total,
  jsonb_agg(
    jsonb_build_object(
      'request_id', id,
      'work_date', work_date,
      'sequence', approved_sequence_in_month,
      'deduction_amount', deduction_amount,
      'is_frequent', approved_sequence_in_month >= 3
    ) order by approved_sequence_in_month
  ) filter (where status = 'APPROVED') as notes
from attendance_correction_requests
group by employee_id, date_trunc('month', work_date)::date;

