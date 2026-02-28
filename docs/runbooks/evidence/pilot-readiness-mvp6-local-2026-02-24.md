# Pilot Readiness Checkpoint (Local Staging Stack)

Date: `2026-02-24`
Scope: Execute the six pilot-readiness workstreams on the running local staging stack and capture evidence artifacts.

## Environment
- API base: `http://localhost:8000`
- Alertmanager: `http://localhost:9093`
- Alert receiver confirm base: `http://localhost:5001`
- Run id seed: `mvp6_local_20260224_142946`

## 1) Alert forwarding smoke
- Slack smoke result: `PASS` (receiver + forward confirmation)
- PagerDuty smoke result: `PASS` (receiver + forward confirmation)
- Evidence:
- `docs/runbooks/evidence/alert-smoke-slack-mvp6_local_20260224_142946-retry.log`
- `docs/runbooks/evidence/alert-smoke-pagerduty-mvp6_local_20260224_142946.log`
- Note: forward target is local receiver sink (`http://alert-receiver:5001`) in this local stack.

## 2) Second tuned staged load profile + gate lock
- Command profile: `USERS=40 SPAWN_RATE=8 DURATION=5m LOCK_GATES=true`
- Run id: `mvp6_local_second_profile_20260224_143228`
- Gate result: `PASS`
- Locked gates file updated: `infra/loadtest/gates.pilot.locked.json`
- Evidence:
- `infra/loadtest/results/mvp6_local_second_profile_20260224_143228_gates.md`
- `infra/loadtest/results/mvp6_local_second_profile_20260224_143228_locked_gates.md`
- `infra/loadtest/results/mvp6_local_second_profile_20260224_143228_stats.csv`

## 3) Low-sample domain volume + calibration apply
- Target minimum: `MIN_JOBS=20/domain`
- Result: all approved domains already above threshold.
- Final job counts:
- `allrecipes.com=37`
- `bbcgoodfood.com=40`
- `diffordsguide.com=30`
- `food.com=26`
- `imbibemagazine.com=57`
- `punchdrink.com=28`
- Calibration apply: updated all six approved domains.
- Evidence:
- `docs/runbooks/evidence/staging-boost-crawl-mvp6_local_20260224_142946.json`
- `docs/runbooks/evidence/calibration-apply-mvp6_local_20260224_142946.json`
- `docs/runbooks/evidence/calibration-preview-mvp6_local_20260224_142946.json`
- `docs/runbooks/evidence/boost-crawl-volume-mvp6_local_20260224_142946.log`

## 4) Recovery patch generation/apply from failure classes
- Recovery preview/apply executed with safe-key enforcement.
- Outcome: no supported failure classes observed in current telemetry; no patches proposed/applied.
- Evidence:
- `docs/runbooks/evidence/staging-recovery-patches-mvp6_local_20260224_142946.json`
- `docs/runbooks/evidence/recovery-preview-mvp6_local_20260224_142946.log`
- `docs/runbooks/evidence/recovery-apply-mvp6_local_20260224_142946.log`

## 5) Expanded E2E matrix (web + mobile tertiary/deep-link paths)
- Web e2e suite: `PASS` (`13` tests)
- Mobile e2e suite: `PASS` (`12` tests)
- Added coverage:
- web deep-linked harvest detail offline->retry path
- web deep-linked harvest detail not-found error path
- web studio sessions offline disabled path
- web studio session tertiary action disable path after offline failure
- web knowledge offline disabled path across search/ingest/licenses
- mobile harvest detail deferred retry + offline disable path
- mobile review deep-link offline tertiary path

## 6) Readiness docs/status update
- Updated: `docs/MVP_PILOT_STATUS.md`
- Updated: `docs/NEEDS_FROM_YOU.md`
- This checkpoint file added as evidence for the latest execution.

## Remaining gap before real pilot sign-off
- Real external destination validation still pending:
- real `SLACK_WEBHOOK_URL`
- real `PAGERDUTY_ROUTING_KEY`
- non-local confirm endpoint and downstream destination confirmation
- Real staging-host run still required for final sign-off:
- tuned load against representative staging traffic window
- go/no-go recorded against current locked gates without relying on local-only runs
