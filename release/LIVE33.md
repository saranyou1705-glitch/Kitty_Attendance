# Live33 fixes (2026-09-24)

- Office/Stock Refill new UI and live gateway require IN → BREAK_OUT → BREAK_IN → OUT. Original service untouched; BA/Driver unchanged.
- Remove normal refresh button; retain reconciliation only for uncertain write outcomes, never blindly retry clock writes.
- OT checks own server history and hides repeat submission for pending/approved matching mode/date; never deletes history or claims sandbox OT is production.
- Native month/date fields constrained with shrinkable grid tracks; no claim of iPhone visual UAT.
- Admin can edit timestamp of an existing attendance event with required reason and explicit confirmation. Gateway verifies actual ADMIN, rejects HR preview and extra fields, forwards actual LINE token to original audited update/recalculate path. Does not add/delete events or grant HR editing.
- 127 automated tests passed, including Admin/HR separation, strict sequence, stale OT response handling, and editor rendering.
- No actual employee event was edited as an assistant test. Deployment of frontend to production and staging authorized by current correction request and ongoing production rollout.
