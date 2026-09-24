# OT requests / live15 — 2026-09-24

User confirmed both USE_PRIOR and MAKEUP_NEXT, adjacent WORKING days only, reviewed by HR. Admin retains access.

- Removed requested clock/calendar history and calendar month totals.
- Correction form says ส่งให้ HR, hides 200-baht explanation. Approved correction sequence >=3 is red. This is a presentation change: existing correction deduction policy and Excel amounts remain unchanged.
- Saved drafts have an explicit send action, keep their UUID on retry and are removed only after success.
- OT requests are separate kitty_staging.overtime_requests and overtime_audit tables. No effect on correction counts/penalties.
- Service-only kitty_staging_overtime_v1 RPC. Identity derives from LINE; active employee ownership and HR HO scope are enforced inside the RPC.
- Balance uses paid_work_hours (net after break) vs required_hours from existing schedule. Source day must have last_out_at.
- Work days require explicit WORK/WFH schedule with required_hours>0. All intervening dates need schedules; absent schedules are not assumed holidays.
- USE_PRIOR pairs previous scheduled workday with selected date; MAKEUP_NEXT pairs selected date with next scheduled workday. Missing dates fail closed. Source cannot be in future and submit target cannot already be past.
- Active requests reserve minutes. Per-employee transaction locks serialize submissions/reviews. Reservations in either direction prevent covering the same shortage twice or spending hours already committed to earlier debt.
- Rechecks balance and date pair at approval. Reject/cancel release pending reservations. Replays do not duplicate records or audit.
- Approved requests are permission records in a SANDBOX, not actual attendance settlement. No automatic shortage deduction, net-hours adjustment, payroll change or production schedule update occurs.
- OT appears in correction queue/badge and in own history, with mode, minutes and paired dates. Individual Excel includes [ทดลอง] OT notes.
- Read status remains browser-local. Existing tests exercise endpoint scope, storage failure and request retries.

SQL verified with synthetic identities/schedules in private fixture schemas then ROLLBACK, before applying only supabase/isolated/20260924_overtime.sql. Tests include holiday pairing, missing schedules, cross-mode overbooking, cancel, approval replay and HR/BA scope. No real employee rows were inserted or edited.

Live-account UI UAT and eventual settlement/payroll integration remain required. Half-day leave sandbox approvals do not rewrite production required_hours; OT uses the existing schedule until a separate sandbox attendance projection is implemented.
