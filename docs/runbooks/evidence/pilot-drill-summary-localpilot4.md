# Pilot Ops Drill Summary

- Run id: `localpilot4`
- API base URL: `http://localhost:8000`
- Alertmanager URL: `http://localhost:9093`
- Calibration applied: `false`
- Load profile executed: `false`
- Gate lock executed: `false`

## Evidence
- Health: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-health-localpilot4.json`
- Metrics snapshot: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-metrics-localpilot4.txt`
- Calibration preview: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-preview-localpilot4.json`
- Calibration apply: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-apply-localpilot4.json`
- Alert smoke: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-alert-smoke-localpilot4.log`
- Runbook checks: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-runbook-check-localpilot4.txt`

## Notes
- If calibration apply was skipped, `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/pilot-drill-calibration-apply-localpilot4.json` may not exist.
- If load profile was skipped, run `infra/loadtest/run_staging_profile.sh` separately.
