# LINE completed OT — 25 September 2026

Report-only change: approved Head Office OT on the target workday is excluded from short/over LINE exception lists when the pair is READY, source capacity is positive, remaining shortage is zero, and actual checkout reaches the displayed nine-hour adjusted departure (minute precision). Both USE_PRIOR and MAKEUP_NEXT are supported. Pending, cancelled, invalidated schedules, unfinished clocks/breaks and remaining shortages retain normal behavior. Source-day unused excess is not hidden by this exemption. Sub-minute short-hour rounding residue no longer creates a zero-minute shortage entry.

No attendance event, daily total or payroll mutation. Report loading fails if verification fails rather than sending an unverified report. New RPC is service-role-only. Original report sender/recipients, authentication, attendance calculation and BA/Driver branches are unchanged.

Original rapid-processor was downloaded fresh (version 29, checksum c7952cd21ff7a34011238ce6ca43cc54e81c6abff3322b83ab02b5300c17bc78) before the narrow patch. This is an explicitly authorized report-only update, not replacement with staging code.

Deploy only 20260925_line_ot_complete.sql, then rapid-processor and rapid-processor-staging with their existing verify_jwt=false setting. No frontend release required. Tests: 116 Node assertions passed; transactional SQL assertions rolled back successfully. No test LINE messages sent.

Rollback: remove the completed-OT RPC lookup and two completedOtEmployees checks from both report loaders; restore short_hours > 0 if reverting the rounding fix as well. Redeploy only those functions. The read-only SQL helpers may remain unused. Never roll back real requests or attendance.
