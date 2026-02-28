# Pilot Ops Drill Summary

- Run id: `localpilot_continue_20260213`
- API base URL: `http://localhost:8000`
- Alertmanager URL: `http://localhost:9093`
- Calibration applied: `false`
- Load profile executed: `true`
- Gate lock executed: `true`

## Evidence
- Health: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-health-localpilot_continue_20260213.json`
- Metrics snapshot: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-metrics-localpilot_continue_20260213.txt`
- Calibration preview: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-preview-localpilot_continue_20260213.json`
- Calibration apply: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-apply-localpilot_continue_20260213.json`
- Alert smoke: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-alert-smoke-localpilot_continue_20260213.log`
- Runbook checks: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-runbook-check-localpilot_continue_20260213.txt`

## Notes
- If calibration apply was skipped, `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-apply-localpilot_continue_20260213.json` may not exist.
- If load profile was skipped, run `infra/loadtest/run_staging_profile.sh` separately.
