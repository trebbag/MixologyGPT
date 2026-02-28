# Pilot Ops Evidence - 2026-02-08 18:48 local

## Scope completed
- Per-domain threshold calibration applied from staged telemetry.
- Pilot ops drill executed with timestamped evidence artifacts.
- Kill-switch flow validated (disable/restore domain policy with blocked harvest verification).
- Rollback flow validated (known-good image tag redeploy + health/metrics verification).
- Incident runbook flow validated (alert smoke + alert state + telemetry snapshot).

## Calibration result
- Updated domains:
  - `allrecipes.com`
  - `food.com`
- Skipped with `no_telemetry`:
  - `bbcgoodfood.com`
  - `diffordsguide.com`
  - `imbibemagazine.com`
  - `punchdrink.com`
- Evidence:
  - `docs/runbooks/evidence/calibration-apply-2026-02-08_184753.json`
  - `docs/runbooks/evidence/calibration-policies-before-2026-02-08_184602.json`
  - `docs/runbooks/evidence/calibration-policies-after-2026-02-08_184602.json`

## Drill evidence
- Pilot drill summary:
  - `docs/runbooks/evidence/pilot-drill-summary-2026-02-08_184807.md`
- Kill-switch summary:
  - `docs/runbooks/evidence/kill-switch-summary-2026-02-08_184630.md`
- Rollback artifacts:
  - `docs/runbooks/evidence/rollback-compose-ps-2026-02-08_184653.txt`
  - `docs/runbooks/evidence/rollback-health-2026-02-08_184653.json`
  - `docs/runbooks/evidence/rollback-metrics-2026-02-08_184653.txt`
- Incident summary:
  - `docs/runbooks/evidence/incident-summary-2026-02-08_184703.md`
