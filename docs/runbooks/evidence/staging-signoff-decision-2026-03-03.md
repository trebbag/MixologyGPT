# Staging Sign-Off Decision - 2026-03-03

## Run
- Workflow: `Staging Sign-Off (Load + Gates)`
- Run id: `22603893539`
- Base URL: `https://mixologygpt.onrender.com`
- Users / spawn / duration: `40 / 8 / 5m`
- Gates file: `infra/loadtest/gates.pilot.locked.json`

## Result
- Decision: `NO-GO` (pilot gate breach)
- Evidence:
  - `docs/runbooks/evidence/staging_signoff_22603893539_gates.md`
  - `docs/runbooks/evidence/staging_signoff_22603893539_stats.csv`

## Gate evaluation summary
- PASS: `non_harvest_error_rate` (`0.0000 <= 0.005`)
- PASS: `harvest_429_rate` (`0.0223 <= 0.05`)
- PASS: `search_error_rate` (`0.0000 <= 0.003`)
- PASS: `studio_generate_error_rate` (`0.0000 <= 0.003`)
- FAIL: `search_p95_ms` (`730 > 700`)
- FAIL: `studio_generate_p95_ms` (`1100 > 600`)
- PASS: `aggregate_p95_ms` (`880 <= 900`)

## Required before next sign-off
1. Reduce search p95 by at least ~30ms under the same profile.
2. Reduce studio generate p95 by at least ~500ms under the same profile.
3. Re-run `Staging Sign-Off (Load + Gates)` and require `Overall result: PASS` before pilot go-live.
