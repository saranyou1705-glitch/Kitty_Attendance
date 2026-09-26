# Production45 — missing schedules and weekend WFH

OT pairing now falls back to actual Head Office daily records (first clock-in, WORK status, positive required hours) only when no explicit schedule exists. Explicit holidays/leaves always win; unknown intervening days still block pairing. This does not generate schedules or alter employee attendance. The original nine-hour default calculator remains unchanged.

Read-only production verification: HO027 Fai has no schedules, but September 24–25 daily records exist. Pair now returns READY, source capacity 256 minutes, target shortage 28 minutes. No request was submitted or approved on her behalf. Existing submission expiry remains: September 24 excess belongs to September 25, not September 26.

Restored original weekend WFH action on the personal clock page. Button appears Saturday/Sunday before attendance exists and disappears after WFH. The gateway derives the employee from LINE, restricts to today, active employees, no events, and no conflicting leave schedule. Original self_weekend_wfh performs the write/recalculation. WFH clock buttons are disabled. No real WFH record was created as a test.

Validation: isolated rollback SQL tests prove missing-schedule fallback, explicit OFF priority, both pair directions, and unknown-gap rejection. Node regression suite includes UI visibility/live routing and gateway identity/date/event guards. Browser/iPhone visual UAT not performed.

Deployment: apply only 20260926_ot_daily_fallback.sql; deploy kitty-attendance-live; publish frontend production45. Rollback UI/gateway to production44 source; restore ot_pair from 20260925_ot_departure.sql if necessary. Do not delete requests or schedules.
