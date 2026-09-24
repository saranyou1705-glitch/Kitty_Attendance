# Personnel onboarding — live25 (staging only)

## Flow
- A LINE user without a production employee record enters only a name; verified LINE identity is stored by the server.
- HR/Admin sees pending applicants in Employees and a red tab dot. Reading an applicant persists a per-manager read receipt on the server.
- HR fills code, name, department, position, start date and weekly dayoff checkboxes. HR can edit existing HO profiles with the same form.
- New personnel are Head Office / STANDARD only in this release. Existing employee codes cannot be changed.
- Edit concurrency uses version checks; duplicate codes and mixed target IDs are rejected.
- Production identities, roles, LINE IDs, active flags, attendance modes, schedules and payroll are not editable through this workflow.

## Isolation
All writes are in kitty_staging.registrations, personnel, registration_reads and personnel_audit.
The service-only RPC kitty_staging_personnel_v1 verifies manager scope independently of the UI.
Public employees/admins are read for identity and scope; anon/authenticated have no direct private access.
Personnel edits are overlays in the Employees view/profile only; attendance, reports and schedule generation continue reading original production values.
Weekly dayoff checkboxes save configuration in the sandbox; they do NOT generate or change production schedules.
Registration READY means HR filled sandbox information, not a live attendance account.
Applicants are not granted employee or HR/Admin access.

## Test
Run UI/export and API tests. personnel-workflow.assert.sql is run in synthetic fixture schemas inside a transaction and ROLLBACK before applying only supabase/isolated/20260924_personnel.sql.
Checks cover signup retries, unread/read, HR denial of BA, employee denial of manager actions, name/dayoff save, optimistic concurrency, mixed-target rejection, public privilege revocation, audit and unchanged source employee rows.
Live LINE end-to-end and mobile visual checks still required.

## Manual UAT
1. A new LINE account opens Staging and sends its name; submitting again does not duplicate.
2. HR opens Employees (red dot), opens new applicant; dot disappears for that HR.
3. Fill an unused HO code, name, department/position/start date and check weekdays, then save.
4. Reopen the sandbox profile; check selected weekdays persist. Applicant sees HR completed message.
5. Edit an existing HO employee; original attendance/production data remain unchanged.
6. A second editor saving an obsolete version must receive a reload message.
7. Admin retains original navigation and can inspect BA/Driver profiles; HR cannot.

Deploy only rapid-processor-staging and the separate Kitty_Attendance_Staging site.

