# Live-data staging verification

Open https://liff.line.me/2010336238-UABz60wq in LINE with a registered employee account.

1. Check Bangkok date/time against a clock. Time uses serverTime from bootstrap plus elapsed device time and updates every second.
2. Check attendance against the original system for the same account/date. No placeholder coordinates, people, attendance events or financial figures are displayed.
3. Open personal calendar, change month and date. Both endpoints derive the employee from the LINE token; the UI never sends another employee's ID.
4. Admin/HR: open employee directory, search and select a person to inspect the selected day's events. In Schedule, select a date in the calendar. Cross-check with the original system.
5. Open Monthly Summary, select month, compare period and totals against production. These are existing-system totals, NOT the new compensation/penalty policy. Print/PDF is available from the browser.
6. Open LINE Report Preview as Admin, switch date/type. No report is sent and no report_logs rows are inserted by staging preview.
7. HR must not receive BA/Driver employees or LINE/system actions. HR monthly rows additionally exclude names matching Shane/Peet. Name-based exclusion is provisional until stable employee-ID exclusions are configured; fail-closed HO-code filtering may omit other Office employees.
8. Switch Admin/HR to My Attendance. Create a half-day AM or PM leave draft; verify 240 required net minutes. Drafts are sessionStorage-only, isolated by employee ID, and explicitly NOT submitted or approved. Reload the same tab to check persistence. Closing the tab can remove them.
9. Disconnect network and reload. An error and retry must appear, not fabricated data. The client no longer assumes a Failed to fetch is a browser/CORS fault.

## Limits that remain

The staging API is unconditionally read-only. Production clocking, sending/approving leave/correction requests, employee edits, role edits, weekly-dayoff changes, schedule edits, event edits and LINE Send Now are not enabled here. Leave/approval history, Audit Log and system settings are not connected in this UI. Existing Admin navigation remains; unfinished views explicitly state their status. No production functions or database migrations are changed/applied.

Staging API still uses the existing report calculations. The new compensation and 200-baht policy must not be presented as applied until an isolated writable staging database and request/approval workflow have been implemented and tested. Local drafts cannot be seen by another device or approver.

## Tests

`node --test staging/live-ui.test.cjs`

`TYPESCRIPT_MODULE=/absolute/path/to/typescript node --test staging/read-only-api.test.cjs`

The second suite executes the deployed-function source with mocked database/LINE adapters. It checks write rejection, HR filtering, direct-request permissions and read-only report preview. Do not confuse these fixture tests with verification against a user's live records.
