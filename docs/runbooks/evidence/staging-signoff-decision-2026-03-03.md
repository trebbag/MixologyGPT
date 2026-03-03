# Staging Sign-Off Decision - 2026-03-03

## Latest locked-gate run
- Workflow: `Staging Sign-Off (Load + Gates)`
- Run id: `22605681114`
- Base URL: `https://mixologygpt.onrender.com`
- Users / spawn / duration: `40 / 8 / 5m`
- Gates file: `infra/loadtest/gates.pilot.locked.json`

## Result
- Decision: `GO-CANDIDATE` (technical gates PASS; owner signoff still required)
- Evidence:
  - GitHub Actions run `22605681114` artifacts (`staging-readiness-load-staging_signoff_22605681114_*`)
  - GitHub Actions run `22606179707` artifacts (`staging-pilot-all-six`)

## Gate evaluation summary (run `22605681114`)
- PASS: `non_harvest_error_rate` (`0.0000 <= 0.005`)
- PASS: `harvest_429_rate` (`0.0000 <= 0.05`)
- PASS: `search_error_rate` (`0.0000 <= 0.003`)
- PASS: `studio_generate_error_rate` (`0.0000 <= 0.003`)
- PASS: `search_p95_ms` (`140 <= 700`)
- PASS: `studio_generate_p95_ms` (`240 <= 600`)
- PASS: `aggregate_p95_ms` (`200 <= 900`)

## Notes
- This PASS supersedes the earlier NO-GO run (`22603893539`).
- `Staging Pilot All-Six` latest run (`22606179707`) is also PASS and includes web/mobile/compliance coverage.

## Remaining before pilot launch
1. Owner GO/NO-GO decision against the latest PASS evidence.
2. If CI-driven staging deploy is required, populate deploy secrets for `.github/workflows/staging-deploy.yml`.
