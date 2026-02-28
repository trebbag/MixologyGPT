# Pilot Ops Drill Summary

- Run id: `2026-02-13_171155`
- API base URL: `http://localhost:8000`
- Alertmanager URL: `http://localhost:9093`
- Calibration applied: `true`
- Load profile executed: `true`
- Gate lock executed: `false`

## Evidence
- Health: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-health-2026-02-13_171155.json`
- Metrics snapshot: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-metrics-2026-02-13_171155.txt`
- Calibration preview: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-preview-2026-02-13_171155.json`
- Calibration apply: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-apply-2026-02-13_171155.json`
- Alert smoke: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-alert-smoke-2026-02-13_171155.log`
- Runbook checks: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-runbook-check-2026-02-13_171155.txt`

## Notes
- If calibration apply was skipped, `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-apply-2026-02-13_171155.json` may not exist.
- If load profile was skipped, run `infra/loadtest/run_staging_profile.sh` separately.
