# Kitty Attendance staging

This branch keeps the production page and `rapid-processor` unchanged.

## Safety model

- Staging function name: `rapid-processor-staging`
- It can read current data through the existing LINE identity check.
- Writes, attendance recording, schedule edits, recalculation, LINE sends, and cron actions return `STAGING_READ_ONLY` by default.
- Production writes remain blocked regardless of STAGING_WRITE_ENABLED. Only explicit staging_request_* actions can write, through the service-only RPC into kitty_staging.

## Deployment order

1. Deploy only `rapid-processor-staging`.
2. Do not change or redeploy `rapid-processor`.
3. Point the experimental UI to the staging function URL.
4. Verify employee, HR, and admin read-only views.
5. The separately authorized kitty_staging tables now support sandbox requests only. See staging/REQUEST-WORKFLOW.md. Never apply the old public-table migration with db push.

The experimental UI lives in `staging/`. When opened from the configured LIFF
endpoint it reads the signed-in employee, today's attendance, and (for an
authorized admin) the live employee directory and daily summary from
`rapid-processor-staging`. Write controls are disabled in the browser and are
also rejected by the staging function.

No production deployment is performed from this branch.
