# Pilot Ops Drill Evidence (2026-02-08)

## Scope
- Calibrate per-domain crawler alert thresholds from staging traffic and persist policy updates.
- Run pilot ops drill and verify runbook flow readiness.
- Execute kill-switch and rollback drills with evidence artifacts.

## Environment
- API: `http://localhost:8000`
- Alertmanager: `http://localhost:9093`
- Compose stack: `infra/staging/docker-compose.staging.yml`

## Traffic Generation (Staging)
Source: `/tmp/bartenderai-harvest-traffic.json`
- Domains sampled: `allrecipes.com`, `bbcgoodfood.com`, `diffordsguide.com`, `food.com`, `imbibemagazine.com`, `punchdrink.com`
- Jobs queued: `10`
- Jobs run: `10`
- Job outcome: `10 succeeded`, `0 failed`
- Notable compliance behavior:
  - `imbibemagazine.com`: compliance rejections observed during auto harvest (`9`)
  - `punchdrink.com`: compliance rejections observed during auto harvest (`8`)

## Calibration and Persistence
- Command:
  - `API_BASE_URL=http://localhost:8000 INTERNAL_TOKEN=*** APPLY=true MIN_JOBS=1 BUFFER_MULTIPLIER=1.25 ./infra/staging/calibrate_alert_thresholds.sh`
- Artifact: `/tmp/bartenderai-calibration-apply-min1.json`
- Recommended/applied thresholds (domains meeting sample floor):
  - `allrecipes.com`
  - `food.com`
- Persistence readback verified via `GET /v1/recipes/sources`:
  - `max_failure_rate=0.08`
  - `max_retry_queue=3`
  - `max_compliance_rejections=1`
  - `max_parser_fallback_rate=0.25`
  - `max_parse_failure_rate=0.15`
  - `max_avg_attempt_count=1.45`

## Kill-Switch Drill
- Artifact: `/tmp/bartenderai-killswitch-evidence.json`
- Steps executed:
  1. Disabled `food.com` policy via admin API patch (`is_active=false`).
  2. Verified harvest discovery blocked URL (`Source not allowed`).
  3. Verified domain removed from active harvest policies.
  4. Re-enabled domain (`is_active=true`) and verified restoration.
- Result: `PASS`

## Alert End-to-End Smoke
- Synthetic alert posted through Alertmanager and routed to a live local webhook receiver (`host.docker.internal:9999/alerts`).
- Artifacts:
  - `/tmp/bartenderai-alert-smoke.log`
  - `/tmp/bartenderai-alert-webhook-summary.json`
  - `/tmp/bartenderai-alert-webhook.jsonl`
- Delivery result: `received_count=1`
- Result: `PASS`

## Rollback Drill
- Simulated known-good redeploy using explicit image tags:
  - `bartenderai-api:known-good`
  - `bartenderai-workers:known-good`
  - `bartenderai-web:known-good`
- Artifacts:
  - `/tmp/bartenderai-rollback-compose-ps.txt`
  - `/tmp/bartenderai-rollback-health.json`
  - `/tmp/bartenderai-rollback-metrics-head.txt`
- Verification:
  - API health returned `{"status":"ok"}`
  - Metrics endpoint responded successfully
  - All services healthy/running after redeploy
- Result: `PASS`

## Incident Runbook Flow Validation
Mapped to `docs/runbooks/incident-response.md`:
1. Detect: health + metrics + crawler telemetry sampled.
2. Triage: domain telemetry and parser/compliance behavior reviewed.
3. Contain: kill-switch executed on one domain.
4. Mitigate: rollback drill executed with explicit known-good tags.
5. Recover: post-rollback smoke checks passed (`/health`, `/metrics`).
6. Postmortem inputs: evidence artifacts above captured for incident timeline.

Overall status: `PASS` for operational drill flow.
