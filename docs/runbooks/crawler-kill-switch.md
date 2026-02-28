# Crawler Kill Switch Runbook

## Purpose
Immediately stop automated crawling/harvest when compliance, source integrity, or operational risk is detected.

## Triggers
- Legal/compliance incident on any source domain.
- Sustained crawler failures or runaway retries.
- Incorrect parser extraction causing unsafe or low-quality ingest.

## Immediate Actions (5 minutes)
1. Pause crawler sweeps by stopping worker periodic scheduling:
   - `celery -A app.celery_app worker` should be restarted without `-B` for emergency stop.
2. Disable affected source policies:
   - Admin UI: `Admin -> Source Policies -> Active` toggle off.
   - API fallback:
     - `PATCH /v1/admin/source-policies/{policy_id}` with `{ "is_active": false }`.
3. Block internal trigger jobs if needed:
   - Rotate `INTERNAL_TOKEN` and redeploy workers/API.

## Verification
1. `GET /v1/recipes/harvest/policies` returns no active entries for disabled domains.
2. `GET /v1/admin/crawler-ops/telemetry` shows no growth in pending/running jobs for blocked domains.
3. Worker logs show no new `sweep_source_policies` queued work.

## Recovery
1. Patch parser settings / thresholds for affected domains.
2. Re-enable one domain at a time.
3. Monitor telemetry for 30 minutes before broader re-enable.
