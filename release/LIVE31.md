# Production 31 — live leave/correction and LINE-linked HR
Date: 2026-09-24

## Published scope
- Live clock remains routed through original rapid-processor checks.
- New live leave/correction tables and service-only RPC; approvals transactionally update real schedules/events and recalculate.
- Half-day leave requires 240 net minutes with full break subtraction. Ordinary-day paid-break rules unchanged.
- Approved corrections count by work-date month; third onward red, no automatic 200 deduction.
- Production frontend enables requestsLive; staging source default remains false.
- Production uses main LIFF ID 2010336238-Ub6d565R. Legacy entry preserved.
- HR signup: ?register=hr. Admin grants/revokes via Settings; LINE identity verified server-side, never written to legacy public.admins.
- Scoped read service recognizes approved live HR for reads only, preserving Head Office and report exclusions.
- New live drafts/read markers separate from sandbox. No trial rows migrated.

## Not yet live / not full completion
- OT approvals and personnel registration/edit/dayoff writes remain sandbox.
- New HR cannot use sandbox mutations; live leave/correction queues stay available even if sandbox queue denied.
- Original Admin edit, office/settings, LINE send and audit remain accessible via legacy.html; new UI is not full parity.
- BA correction uses legacy Admin path, not this generic correction endpoint.
- No authenticated employee/HR browser UAT or actual attendance test write performed by assistant.

## Verification
123 Node tests pass; live-request-validation.sql passed in cloned fixtures with transaction ROLLBACK.
Tested half-day net4, unchanged ordinary-day rules, correction idempotence, scoped HR denial, malformed chronology atomic rollback, legacy override, anonymous denial.
Unauthenticated live request queue returns HTTP401 MISSING_LINE_TOKEN.

## Recovery
Disable requestsLive in production app and publish to stop new frontend submissions.
Do not delete approved live records, effects, audits, or attendance events. Leave trigger must remain for approved half-day consistency.
To revert a real approval use a reviewed compensating change, not deletion of schemas or replaying old migrations.
Original rapid-processor unchanged. Keep legacy.html as fallback.

## Owner checks
1. Open main LIFF, verify own identity and existing times.
2. Submit only a genuine leave/correction; Admin/HR approves, check schedule and time summary.
3. Open registration link with intended HR LINE account; Admin confirms correct name/LINE ID in Settings, grant, HR signs in again.
4. Check HR only sees Head Office and excludes Shane/Peet from monthly reports.
5. Verify desktop/mobile; LINE Send and other legacy-only functions use legacy entry.
