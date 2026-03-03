# Pilot Ops Drill Summary

- Run id: `gh_pilot_drill_22603591164_1`
- API base URL: `https://mixologygpt.onrender.com`
- Alertmanager URL: `disabled`
- Calibration applied: `true`
- Alert smoke executed: `false`
- Load profile executed: `true`
- Gate lock executed: `false`

## Evidence
- Health: `/home/runner/work/MixologyGPT/MixologyGPT/docs/runbooks/evidence/pilot-drill-health-gh_pilot_drill_22603591164_1.json`
- Metrics snapshot: `/home/runner/work/MixologyGPT/MixologyGPT/docs/runbooks/evidence/pilot-drill-metrics-gh_pilot_drill_22603591164_1.txt`
- Calibration preview: `/home/runner/work/MixologyGPT/MixologyGPT/docs/runbooks/evidence/pilot-drill-calibration-preview-gh_pilot_drill_22603591164_1.json`
- Calibration apply: `/home/runner/work/MixologyGPT/MixologyGPT/docs/runbooks/evidence/pilot-drill-calibration-apply-gh_pilot_drill_22603591164_1.json`
- Alert smoke: `/home/runner/work/MixologyGPT/MixologyGPT/docs/runbooks/evidence/pilot-drill-alert-smoke-gh_pilot_drill_22603591164_1.log`
- Runbook checks: `/home/runner/work/MixologyGPT/MixologyGPT/docs/runbooks/evidence/pilot-drill-runbook-check-gh_pilot_drill_22603591164_1.txt`

## Notes
- If calibration apply was skipped, `/home/runner/work/MixologyGPT/MixologyGPT/docs/runbooks/evidence/pilot-drill-calibration-apply-gh_pilot_drill_22603591164_1.json` may not exist.
- If load profile was skipped, run `infra/loadtest/run_staging_profile.sh` separately.
