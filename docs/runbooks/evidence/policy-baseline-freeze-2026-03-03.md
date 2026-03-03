# Source Policy Baseline Freeze - 2026-03-03

## Scope
Freeze the pilot source-policy baseline after a real-staging soak window and calibration refresh.

## Soak window evidence
- Start anchor: `Staging Pilot All-Six` run `22546128104` (success), started `2026-03-01T15:09:27Z`.
- End anchor: `Staging Weekly Drift Review` run `22603493821` (success), started `2026-03-03T01:10:15Z`.
- Effective soak duration: ~34 hours (>= 24h target).

## Calibration and telemetry evidence
- Policy maintenance run: `22603483241` (success)
  - artifact: `docs/runbooks/evidence/staging-boost-crawl-gh_policy_maint_22603483241_1.json`
  - artifact: `docs/runbooks/evidence/calibration-apply-gh_policy_maint_22603483241_1.json`
- Drift review run: `22603493821` (success)
  - artifact: `docs/runbooks/evidence/drift-summary-gh_drift_22603493821_1.md`
  - artifact: `docs/runbooks/evidence/drift-telemetry-gh_drift_22603493821_1.json`

## Approved-domain sample counts at freeze
- `bbcgoodfood.com`: 69 jobs
- `diffordsguide.com`: 25 jobs
- `food.com`: 52 jobs
- `imbibemagazine.com`: 100 jobs
- `punchdrink.com`: 39 jobs
- `thecocktaildb.com`: 20 jobs

All approved domains satisfy `MIN_JOBS >= 20` at freeze time.

## Alert baseline locked for pilot operations
Per-domain calibration in the apply artifact converged to:
- `max_failure_rate=0.08`
- `max_parse_failure_rate=0.15`
- `max_parser_fallback_rate=0.25`
- `max_retry_queue=3`
- `max_compliance_rejections=1`
- `max_avg_attempt_count=1.45`
- `calibration_buffer_multiplier=1.25`

## Decision
Baseline is accepted for pilot continuation.

## Guardrails
- Keep `Staging Policy Maintenance` hourly schedule enabled.
- Keep `Staging Weekly Drift Review` weekly schedule enabled.
- Re-open baseline freeze if any approved domain falls below 20 jobs in the rolling window or alert thresholds drift materially.
