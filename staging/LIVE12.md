# Live12

- Date label has its own aligned grid cell.
- Directory opens a personnel profile, not attendance. Attendance views retain the separate employee-day action.
- HR navigation: Dashboard, Employees, Schedule, Requests, Reports. Recorded leave is accessible from Requests. Admin management features are retained.
- Schedule shows actual in/break/out/work duration only.
- New staging-only read endpoints: admin_employee_profile (allowlisted response fields) and admin_request_queue (PENDING only, latest 100/type, missing-source warnings).
- These endpoints require verified LINE identity and Admin/HR authorization; HR requests are scoped server-side to Head Office. No writes or migrations.

Deployment status: new backend deployment was blocked by approval review because of --no-verify-jwt. Await explicit approval for that authentication configuration. Frontend falls back to basic directory details and an unavailable-source notice; do not claim LINE/dayoff/queue data is live before backend deployment succeeds.

Manual checks: employee Details opens personnel fields, dates align at mobile widths, HR has no Management tab, Requests links to recorded leave, Schedule has no required-hours or schedule-edit buttons. Confirm unavailable request source is not presented as zero pending requests.
