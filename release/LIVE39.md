# Production 39 — live OT and useful daily totals

Live OT uses fresh `kitty_live.overtime_requests`, not trial rows. Authenticated LINE employees submit; approved LINE-linked HR or Admin review. HR remains Head Office-scoped; monthly HR excludes Shane/Peet. This release's live OT submissions are Office-only; BA/Driver clock rules are unchanged.

OT approval projects the minimum of actual excess and shortage between adjacent scheduled working days. Only approved requests consume time. Pending/incomplete attendance never changes totals. Original paid hours remain intact; adjusted short/over/net fields are available to legacy reports as well as the new UI. Recalculation/clock completion updates projections, and schedule changes invalidate changed pairs. No payroll writes.

UI shows prior working day's excess/shortage and daily short/over/complete/OT status. Today makeup maps to the previous shortage date. Old approved request cards remain in history, not the form. Production routes OT to the live gateway; sandbox publication remains isolated.

Validation: 135 Node tests pass; `live-overtime-validation.sql` clones schemas, tests both directions, approval replay, recalculation, incomplete clock/break, edits, schedule invalidation and authorization, then rolls back. No synthetic employee attendance is written to public tables. iPhone LINE visual UAT is not claimed.

Deployment order: apply only `20260925_live_overtime.sql`; deploy `kitty-attendance-live`; publish production assets. Do not run db push. Original rapid-processor and recalculate_daily are unchanged. The leave trigger has a narrowly scoped guard for OT projection writes.

Rollback: first stop new OT submissions/reviews at the gateway, retain all requests/audit/effects. Restore UI from previous release if needed. Do not delete OT tables or disable triggers blindly once approvals exist: approved effects must be reversed transactionally from ot_day_base before restoring the former leave trigger. A database rollback after real approvals requires a reviewed recovery migration; never erase user requests.

Remaining separate parity work: personnel signup/edits are still sandbox-backed in the new UI; schedule editing, LINE Send Now and some legacy Admin management functions are not fully connected. This release does not claim those are live.
