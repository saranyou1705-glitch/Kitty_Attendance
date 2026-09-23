# Isolated requests — 2026-09-23

User authorized a separate table set in the existing project rlqecfzddxpywbbbiirg.

## Boundaries

- New private schema: kitty_staging.
- New tables: requests and request_audit. Neither has a trigger or foreign key that writes/cascades into existing production tables.
- New service-role-only RPC: public.kitty_staging_request_v1.
- Existing employees/admins are read for identity and authorization; all workflow writes target kitty_staging only.
- RLS enabled, no anon/authenticated table or schema access. Only the Edge Function's service credential can invoke the RPC.
- Edge Function derives actor from verified LINE profile, not caller payload. HR scope and ownership are checked again inside the RPC.
- Existing record/recalculate/LINE-send/employee-update actions remain blocked in staging.
- Approval is a SANDBOX decision. It does not update production attendance, schedules, pay or LINE reports.

## Included

Employee can submit leave (full/AM/PM), correction, inspect own history, cancel pending requests. Existing local drafts remain available. Submission client IDs are idempotent. Reusing an ID with a different payload is rejected.

Admin/HR can read separate queues, approve or reject. Rejection requires a reason. Repeated identical decisions return the existing result. Final decisions cannot be reversed through these actions.

Approval counts only APPROVED corrections, grouped by employee and affected work-date month; first two have zero deduction, third and later have 200 each in sandbox. Per-employee transaction locks serialize decisions. Approved half-day leave stores required_net_minutes=240; it does not claim that 4 hours were actually worked.

Excel individual/all-person reports include sandbox request notes while leaving production hours unchanged. Third+ approved corrections retain red report formatting. Legacy missing-source warnings can coexist because older public request tables are absent.

## Verification

- SQL was exercised on the real Postgres engine using synthetic employees/admins in kitty_fixture, then the entire transaction was rolled back before applying the actual schema.
- Assertions cover submission/approval replay, conflict, monthly reset, half-day requirement, ownership, HR excludes BA, Admin scope, cancellation, report notes, audit counts and revoked public permissions.
- Fixture tests are not live user end-to-end approval or concurrency/load testing.
- Frontend and API mocked tests also cover RPC routing, verified identity and HR preview.
- Next: user submits a clearly labeled test from their own account, checks the queue through a permitted reviewer account, then verifies the report. No impersonation or synthetic employee rows were added to public tables.

## Apply / recovery

Only supabase/isolated/20260923_requests.sql was explicitly executed. DO NOT use db push: old migrations are not approved.

To disable workflow, remove STAGING_REQUEST_ACTIONS and restore disabled submit controls. Keep the new schema and audit history; disabling must not delete user requests. Do not drop the schema to roll back UI functionality.

## Not ready for production

Still required: real account UAT, concurrency/load tests, timing effects in a sandbox attendance projection, weekly-dayoff management, time-compensation integration, HR external login, full Admin parity and a reviewed production cutover/recovery plan.
