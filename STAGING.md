# Kitty Attendance staging

This branch keeps the production page and `rapid-processor` unchanged.

## Safety model

- Staging function name: `rapid-processor-staging`
- It can read current data through the existing LINE identity check.
- Writes, attendance recording, schedule edits, recalculation, LINE sends, and cron actions return `STAGING_READ_ONLY` by default.
- Writing is possible only after the secret `STAGING_WRITE_ENABLED=true` is deliberately configured.

## Deployment order

1. Deploy only `rapid-processor-staging`.
2. Do not change or redeploy `rapid-processor`.
3. Point the experimental UI to the staging function URL.
4. Verify employee, HR, and admin read-only views.
5. Create separate staging tables before enabling any write action.

No production deployment is performed from this branch.
