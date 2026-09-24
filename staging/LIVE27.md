# Live27: registration-first HR and own contacts

- HR cannot create a new person without a verified LINE registration, enforced in the private personnel RPC as well as the UI. Existing employee edits and Admin's existing add action remain available.
- Registration completion requires explicit approval. The button fills and approves in one atomic sandbox save; READY means approved in staging, not production activation.
- Employee avatar uses their LINE picture (initial fallback); self profile can edit phone/email only.
- Self-service resolves the active employee from verified LINE identity, rejects extra fields and stale versions, and writes only kitty_staging.employee_contacts. No employee ID from the client is accepted.
- SQL permissions: RLS on contact table, no anon/authenticated access, service-role-only fixed RPC. No production employee, schedule, clock or LINE report writes.
- Validation: 92 UI/export/API tests plus SQL assertions in self-profile-validation.sql, using synthetic fixture schemas and a final ROLLBACK.
- Remaining UAT: use actual employee LINE accounts on phone/desktop to check avatar, contact persistence, and applicant-to-HR approval. Real employee activation is not enabled.
