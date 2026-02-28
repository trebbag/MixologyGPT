# Pilot Ops Drill Summary

- Run id: `local_ops_ready`
- API base URL: `http://127.0.0.1:8000`
- Alertmanager URL: `http://localhost:9093`
- Calibration applied: `true`
- Load profile executed: `true`
- Gate lock executed: `false`

## Evidence
- Health: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-health-local_ops_ready.json`
- Metrics snapshot: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-metrics-local_ops_ready.txt`
- Calibration preview: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-preview-local_ops_ready.json`
- Calibration apply: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-apply-local_ops_ready.json`
- Alert smoke: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-alert-smoke-local_ops_ready.log`
- Runbook checks: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-runbook-check-local_ops_ready.txt`

## Notes
- If calibration apply was skipped, `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-apply-local_ops_ready.json` may not exist.
- If load profile was skipped, run `infra/loadtest/run_staging_profile.sh` separately.
