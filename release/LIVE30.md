# Live30 employee clock activation

- Owner repeatedly authorized immediate real employee use.
- Browser today/employee_month/record actions now route to kitty-attendance-live. Existing rapid-processor remains authoritative for GPS, sequences and recalculate_daily.
- Bootstrap/admin/read/request features retain their existing service routes. Leave/correction/OT approvals and employee edits remain explicitly sandbox, not live. This is NOT full application cutover.
- Header and clock screen disclose actual clock writes separately from sandbox management.
- Clock actions use actual active employee and events; BA previews cannot write; concurrent clicks suppressed; uncertain submissions require explicit reconciliation, never automatic retries.
- Test run: 118 passing automated tests. Actual GPS/LINE employee attendance write was not performed by the agent.
- Backend updated to return safe user-actionable location/sequence errors, without leaking internal service details.
- Recovery: revert frontend clock routing and button changes to live29, publish that version, and disable new gateway clockEnabled if needed. Keep real attendance records and HR audit. Do not roll back real events or modify legacy rapid-processor.
- Initial check for user: sign in via LINE, verify own identity and today's existing events, allow GPS, perform only the next real attendance action, verify the timestamp appears. Do not submit fictitious attendance as a test.
