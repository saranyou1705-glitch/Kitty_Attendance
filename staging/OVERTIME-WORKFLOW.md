# live16: automatic OT pair projection and employee-mode screens

Supersedes the live15 minute-reservation rules below. All changes remain STAGING ONLY.

- Employees submit mode, date, reason and stable client UUID. There is no minutes field. The server ignores legacy client minutes.
- The isolated RPC recalculates each request from both days' paid_work_hours (net after breaks) and scheduled required_hours. A checkout and net total on BOTH days are required; incomplete records show WAITING, not zero.
- Approval is permission only; it is distinct from READY/WAITING attendance projection. READY is a current read-time calculation, NOT a finalized payroll settlement.
- The usable amount is the smaller actual surplus/shortage on adjacent scheduled working days. No projected credit becomes the next day's raw surplus.
- Pending/approved requests are allocated deterministically by source day, target day, created_at, UUID. They reserve only real matched minutes. A shared resource with an earlier unfinished request stays WAITING. Rejection/cancellation releases its allocation. Duplicate active requests for the same employee/mode/day are rejected under the employee lock.
- Previously typed minutes remain in storage for history; returned minutes are calculated, never trusted from the client. No production attendance rows are rewritten.
- HR sees both dates, required/net times, matched minutes and remaining shortage; both approve AND reject use the OT endpoint.
- Admin can open BA/Driver screen previews from Today's Overview or Manage. Previews contain no real identities/data and cannot send attendance. Real BA/Driver accounts see their own mode-specific clock actions and events. Staging clock-write controls remain disabled.
- Existing Admin/HR permissions and production LINE/report/recalculate/clock code are unchanged.

Verification: 45 UI/export tests + 18 API tests. Isolated SQL assertions in overtime-auto.assert.sql run against synthetic schemas in a transaction followed by ROLLBACK. Authenticated live-device UAT still required; no visual-browser verification claimed.

Apply ONLY supabase/isolated/20260924_overtime_auto.sql after the existing OT migration. Do not db push older public migrations. Rollback app release independently; original production unchanged.

Manual checks:
1. Personal > Request clock > OT: pick either mode/date, check both days, send without minutes.
2. HR > Request clock: open OT, inspect pair and totals, approve/reject. Approved permission may still WAITING until both attendance records close.
3. Test 2h surplus/45m shortage => 45m; 1h shortage/30m next-day surplus => 30m + 30m remaining. No shortage => 0m.
4. Admin > Today's overview > View BA / Driver; switch preview types. Neither action changes logged-in identity.
5. With an actual BA or Driver LINE login, verify own event list and no management access.

---
Historical live15 implementation notes (superseded where conflicting):

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
