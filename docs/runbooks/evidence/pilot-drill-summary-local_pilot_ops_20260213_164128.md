# Pilot Ops Drill Summary

- Run id: `local_pilot_ops_20260213_164128`
- API base URL: `http://localhost:8000`
- Alertmanager URL: `http://localhost:9093`
- Calibration applied: `true`
- Load profile executed: `true`
- Gate lock executed: `true`

## Evidence
- Health: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-health-local_pilot_ops_20260213_164128.json`
- Metrics snapshot: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-metrics-local_pilot_ops_20260213_164128.txt`
- Calibration preview: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-preview-local_pilot_ops_20260213_164128.json`
- Calibration apply: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-apply-local_pilot_ops_20260213_164128.json`
- Alert smoke: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-alert-smoke-local_pilot_ops_20260213_164128.log`
- Runbook checks: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-runbook-check-local_pilot_ops_20260213_164128.txt`

## Notes
- If calibration apply was skipped, `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-apply-local_pilot_ops_20260213_164128.json` may not exist.
- If load profile was skipped, run `infra/loadtest/run_staging_profile.sh` separately.
