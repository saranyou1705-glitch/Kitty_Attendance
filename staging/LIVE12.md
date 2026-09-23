# Live12

- Date label has its own aligned grid cell.
- Directory opens a personnel profile, not attendance. Attendance views retain the separate employee-day action.
- HR navigation: Dashboard, Employees, Schedule, Requests, Reports. Recorded leave is accessible from Requests. Admin management features are retained.
- Schedule shows actual in/break/out/work duration only.
- New staging-only read endpoints: admin_employee_profile (allowlisted response fields) and admin_request_queue (PENDING only, latest 100/type, missing-source warnings).
- These endpoints require verified LINE identity and Admin/HR authorization; HR requests are scoped server-side to Head Office. No writes or migrations.

Deployment status (2026-09-23): user explicitly approved option 1 (read-only staging with LINE token and Admin/HR authorization instead of Supabase JWT). Deployed only rapid-processor-staging successfully. Both new endpoints reject requests without LINE tokens (MISSING_LINE_TOKEN; currently HTTP 500). The 15 mocked backend security tests passed. Authenticated live records and the existence of request/dayoff data remain unverified. No database migrations, writes, or production function deployments were performed.

Manual checks: employee Details opens personnel fields, dates align at mobile widths, HR has no Management tab, Requests links to recorded leave, Schedule has no required-hours or schedule-edit buttons. Confirm unavailable request source is not presented as zero pending requests.
