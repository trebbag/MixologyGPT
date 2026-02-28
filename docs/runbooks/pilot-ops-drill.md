# Pilot Ops Drill Runbook

## Goal
Run a repeatable pilot-readiness drill that validates:
- crawler threshold calibration workflow
- alert routing and smoke delivery
- rollback/kill-switch documentation availability
- performance gate evaluation (optional but recommended)

## Preconditions
1. Staging API is reachable.
2. `INTERNAL_TOKEN` is available.
3. Alertmanager is reachable (staging or local tunnel).
4. If performance run is enabled: Locust dependencies are installed.

## Command
```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI
API_BASE_URL=https://<staging-host> \
ALERTMANAGER_URL=https://<alertmanager-host> \
INTERNAL_TOKEN=<internal-token> \
APPLY_CALIBRATION=true \
RUN_LOAD_PROFILE=true \
LOCK_GATES=true \
ALERT_CONFIRM_URL=https://<optional-confirm-endpoint> \
ALERT_CONFIRM_TOKEN=<optional> \
DRILL_RUN_ID=<optional-run-id> \
EVIDENCE_DIR=/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence \
./infra/staging/pilot_ops_drill.sh
```

## Artifacts Produced
1. `docs/runbooks/evidence/pilot-drill-summary-<run-id>.md`
2. `docs/runbooks/evidence/pilot-drill-health-<run-id>.json`
3. `docs/runbooks/evidence/pilot-drill-metrics-<run-id>.txt`
4. `docs/runbooks/evidence/pilot-drill-calibration-preview-<run-id>.json`
5. `docs/runbooks/evidence/pilot-drill-calibration-apply-<run-id>.json` (when `APPLY_CALIBRATION=true`)
6. `docs/runbooks/evidence/pilot-drill-alert-smoke-<run-id>.log`
7. `docs/runbooks/evidence/pilot-drill-runbook-check-<run-id>.txt`
8. `infra/loadtest/results/<run-id>_gates.md` (when `RUN_LOAD_PROFILE=true`)
9. `infra/loadtest/results/<run-id>_locked_gates.md` (when `RUN_LOAD_PROFILE=true` and `LOCK_GATES=true`)

## Pass Criteria
1. Health and metrics checks succeed.
2. Calibration preview returns domain recommendations with no authorization failure.
3. Alert smoke command returns groups and delivery is observed in the destination.
4. Runbook presence checks pass.
5. Optional load gate evaluation returns `PASS`.

## Failure Handling
1. Calibration failure: verify `INTERNAL_TOKEN`, admin user presence, and source policy records.
2. Alert smoke failure: verify `ALERT_WEBHOOK_URL`, receiver network access, and Alertmanager route config.
3. Load gate failure: inspect `*_stats.csv`, tune rate limits/parsers/cache, rerun `run_staging_profile.sh`.
