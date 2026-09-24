# Full production cutover — explicitly selected by owner

Status: FULL CUTOVER NOT READY. New backend kitty-attendance-live version 1 deployed on 2026-09-24.
Live access schema installed empty. No employee role granted, no attendance test writes, no legacy data changed.
The employee website and LINE entry point remain unchanged (live29 still uses staging).

## Verified 2026-09-24
- Downloaded deployed rapid-processor read-only to a separate audit directory. Do not publish that snapshot.
- Existing clock endpoint validates transitions, GPS and invokes recalculate_daily. Keep it authoritative.
- Legacy admin operations check admin membership but do not apply the new HR Head Office restrictions. Never route HR writes directly to these handlers.
- Legacy approval requires requestId, employeeCode and office/mode parameters; the old HTML sends registrationId only. Do not reuse that broken approval wiring.
- All kitty_staging requests and personnel edits remain test data. No blanket migration into production.

## Implementation started
- attendance-client.cjs models actual server transitions and submission boundaries, injected transport for tests. No live endpoint is wired and neither live page loads this candidate.
- Refresh state before recording, preserve Bangkok date and GPS, suppress simultaneous clicks, require reconciliation after uncertain writes, never retry automatically.
- Added live-gateway.ts and handler.ts: verified LINE identity, fixed legacy attendance routes, no arbitrary admin proxy. Deployed through supabase/functions/kitty-attendance-live/index.ts with recording enabled by the owner's explicit production instruction. The frontend has not been connected.
- Added hr-access-ui.js: name-only application and Admin grant/reject/revoke confirmation showing the target LINE ID.
- Applied 20260924_live_access.sql explicitly: isolated live HR grants/audit, no public.admins insertion and no automatic employee creation. Do not reapply this CREATE migration.
- access-validation.sql passed on the real PostgreSQL engine using synthetic tables with a final ROLLBACK. Register/grant/revoke, privilege boundaries, stale decisions and unchanged legacy admins were asserted.
- Current aggregate local test run: 115 passed (release + staging UI/export/API). This is not a real-device or production end-to-end pass.

## Required before switch
1. Integrate and verify the candidate with the new UI and a production-specific authenticated transport.
2. Implement scoped HR services and transactional real approval effects for leave/corrections/OT, with audit and duplicate protection.
3. Registration approval: employee + verified LINE link + office + weekly schedule, atomically; never activate test applications.
4. Admin parity: employee/active status, events add/edit/delete, schedules, daily/monthly/A4/PNG, LINE preview/send and receivers, role settings, audit.
5. Reconcile original and new reports; end-to-end HR/Employee/Admin/BA/Driver on actual devices.
6. Record current deployed versions, source/schema backups, cutover and rollback steps; avoid simultaneous ownership of approval workflows and duplicate LINE sends.

Do not enable production by removing staging guards or merely changing the API URL.

## Deployment evidence / recovery
- kitty-attendance-live: ACTIVE version 1; unauthenticated POST bootstrap returns HTTP 401 MISSING_LINE_TOKEN.
- Original rapid-processor remains ACTIVE version 29 with checksum c7952cd21ff7a34011238ce6ca43cc54e81c6abff3322b83ab02b5300c17bc78.
- rapid-processor-staging remains version 14; no changes to staging request storage.
- No authenticated real-user end-to-end clock or HR approval was performed.
- Recovery for the new backend: set clockEnabled:false in its entry point and deploy only kitty-attendance-live. Preserve kitty_live tables/audit. Do not remove, redeploy or disable the original rapid-processor.
