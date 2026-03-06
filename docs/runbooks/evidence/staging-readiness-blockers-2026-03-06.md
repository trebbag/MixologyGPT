# Staging Readiness Blockers - 2026-03-06

## Current workflow evidence
- `Staging Deploy` run `22783809188`: `FAIL`
  - missing secrets: `STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY`, `STAGING_GHCR_TOKEN`, `STAGING_DEPLOY_PATH`
- `Staging Sign-Off (Load + Gates)` run `22783919469`: `FAIL`
  - runtime surface smoke failed before load because the API returned `400 Disallowed CORS origin` to the live web origin `https://mixologygpt-app.onrender.com`
- `Staging Pilot All-Six` run `22783958092`: `FAIL`
  - precheck failed on the same runtime surface smoke issue
  - authenticated token bootstrap still succeeded and the staged E2E user was promoted to `power`, so auth bootstrap is not the blocker
- `Staging Crawler Warning Review` run `22784025139`: `PASS`
  - `305` jobs total
  - `0` failed jobs
  - `0` retryable jobs
  - no actionable alerts
  - approved domains at or above `MIN_JOBS=20`: `bbcgoodfood.com`, `diffordsguide.com`, `food.com`, `imbibemagazine.com`, `punchdrink.com`, `thecocktaildb.com`

## Immediate fixes required
1. Update the live staging API runtime config so `CORS_ALLOWED_ORIGINS` includes `https://mixologygpt-app.onrender.com`, then redeploy the API/web pair.
2. If GitHub-driven staging deploy is required, populate the missing deploy secrets and rerun `Staging Deploy`.
3. After the live runtime smoke passes, rerun:
   - `Staging Sign-Off (Load + Gates)`
   - `Staging Pilot All-Six`
4. Use the refreshed PASS evidence for the final owner `GO/NO-GO`.

## Notes
- The last historical locked-gate PASS remains `22605681114`, but it is now stale because the current live runtime surface is failing before load tests begin.
- The crawler warning review is clean, so the current pilot blocker is deployment/runtime configuration, not crawler quality.
