# Load Test Report (Search + Studio + Harvest)

## Run Metadata
- Date: `2026-02-08`
- Profile: `pilot_baseline_20260208`
- Driver: `infra/loadtest/locustfile.py`
- Scenario command:
  - `USERS=20 SPAWN_RATE=4 DURATION=3m ./infra/loadtest/run_loadtest.sh http://127.0.0.1:8000`
- Artifacts:
  - `infra/loadtest/results/pilot_baseline_20260208_stats.csv`
  - `infra/loadtest/results/pilot_baseline_20260208_failures.csv`
  - `infra/loadtest/results/pilot_baseline_20260208.html`

## Scope
- Recipe search: `GET /v1/recipes` (`recipes_search`)
- Harvest automation: `POST /v1/recipes/harvest/auto` (`harvest_auto`)
- Studio flow:
  - `POST /v1/studio/sessions` (`studio_create_session`)
  - `POST /v1/studio/sessions/{id}/constraints` (`studio_create_constraint`)
  - `POST /v1/studio/sessions/{id}/generate` (`studio_generate`)
  - `GET /v1/studio/analytics/summary` (`studio_summary`)
  - `GET /v1/studio/sessions/{id}/versions` (`studio_versions`)
- Recommendation check: `GET /v1/recommendations/make-now`
- Auth bootstrap: `POST /v1/auth/dev-token`

## Headline Results
- Total requests: `138`
- Total failures: `8`
- Aggregate error rate: `5.80%`
- Aggregate throughput: `4.74 req/s`
- Aggregate p95 latency: `6400 ms`
- Aggregate p99 latency: `7500 ms`

## Endpoint Detail
| Endpoint name | Requests | Failures | Error rate | Avg (ms) | p95 (ms) | p99 (ms) |
|---|---:|---:|---:|---:|---:|---:|
| `recipes_search` | 20 | 0 | 0.00% | 203.45 | 1400 | 1400 |
| `harvest_auto` | 23 | 8 | 34.78% | 3905.76 | 7500 | 8200 |
| `studio_create_session` | 17 | 0 | 0.00% | 339.16 | 3300 | 3300 |
| `studio_create_constraint` | 17 | 0 | 0.00% | 7.22 | 17 | 17 |
| `studio_generate` | 17 | 0 | 0.00% | 8.38 | 15 | 15 |
| `studio_summary` | 16 | 0 | 0.00% | 577.28 | 3500 | 3500 |
| `studio_versions` | 16 | 0 | 0.00% | 4.28 | 6 | 6 |
| `recommendations_make_now` | 4 | 0 | 0.00% | 217.69 | 710 | 710 |
| `auth/dev-token` | 8 | 0 | 0.00% | 24.15 | 64 | 64 |

## Failure Analysis
- All failures were `429 Too Many Requests` from `harvest_auto`.
- Failure file evidence:
  - `POST,harvest_auto,HTTPError('429 Client Error: Too Many Requests for url: harvest_auto'),8`
- No observed `5xx` failures in this run.

## Interpretation
- Search and studio mutation endpoints are stable with zero request failures in this baseline profile.
- The dominant pilot risk is harvest throughput under contention.
- The current rate-limit policy is protecting the crawler (expected), but UX should treat `429` on harvest as queued/try-later rather than hard-fail.

## Tuning Actions Before Pilot Ramp
1. Keep harvest limits conservative for compliance safety; avoid lifting caps until queue latency and compliance rejection rate are within target.
2. Add/confirm client retry/backoff behavior for `429` on harvest paths in web/mobile.
3. Track `crawler_domain_retryable_jobs`, `crawler_domain_parser_fallback_rate`, and `crawler_domain_failure_rate` in Grafana during pilot.
4. Re-run this profile in staging and require:
   - aggregate error rate `< 2%` excluding intentional harvest throttling
   - `harvest_auto` `429` rate `< 10%` at the selected pilot load
5. Run a second profile after parser and worker tuning:
   - `USERS=40 SPAWN_RATE=8 DURATION=5m`

## Notes
- Ensure `OPENAI_API_KEY` is set if harvest/studio paths invoke embedding or generation providers in your environment.
- Keep this report updated by adding a new dated section for each staging or production-like run.

---

## Run Metadata (Second Tuned Profile)
- Date: `2026-02-08`
- Profile: `pilot_tuned_20260208`
- Driver: `infra/loadtest/locustfile.py`
- Scenario command:
  - `USERS=40 SPAWN_RATE=8 DURATION=5m RUN_ID=pilot_tuned_20260208 bash ./infra/loadtest/run_loadtest.sh http://127.0.0.1:8000`
- Artifacts:
  - `infra/loadtest/results/pilot_tuned_20260208_stats.csv`
  - `infra/loadtest/results/pilot_tuned_20260208_failures.csv`
  - `infra/loadtest/results/pilot_tuned_20260208.html`

## Headline Results (Second Tuned Profile)
- Total requests: `13,241`
- Total failures: `875`
- Aggregate error rate: `6.61%`
- Aggregate throughput: `44.26 req/s`
- Aggregate p95 latency: `440 ms`
- Aggregate p99 latency: `2300 ms`

## Endpoint Detail (Second Tuned Profile)
| Endpoint name | Requests | Failures | Error rate | Avg (ms) | p95 (ms) | p99 (ms) |
|---|---:|---:|---:|---:|---:|---:|
| `recipes_search` | 2,786 | 0 | 0.00% | 110.17 | 760 | 2000 |
| `harvest_auto` | 950 | 875 | 92.11% | 451.26 | 4200 | 6400 |
| `studio_create_session` | 1,897 | 0 | 0.00% | 106.78 | 680 | 2000 |
| `studio_create_constraint` | 1,897 | 0 | 0.00% | 38.00 | 100 | 790 |
| `studio_generate` | 1,897 | 0 | 0.00% | 39.96 | 78 | 820 |
| `studio_summary` | 942 | 0 | 0.00% | 191.44 | 810 | 2500 |
| `studio_versions` | 1,897 | 0 | 0.00% | 14.32 | 19 | 350 |
| `recommendations_make_now` | 935 | 0 | 0.00% | 130.80 | 960 | 2200 |
| `auth/dev-token` | 40 | 0 | 0.00% | 258.80 | 830 | 830 |

## Failure Analysis (Second Tuned Profile)
- All observed failures were harvest throttles:
  - `POST harvest_auto -> 875x 429 Too Many Requests`
- No `5xx` responses were observed in this run.
- Non-harvest traffic had `0` failures across `12,291` requests.

## Gate Results (Second Tuned Profile)
| Gate | Target | Actual | Result |
|---|---|---|---|
| Non-harvest aggregate error rate | `< 2%` | `0.00%` | `PASS` |
| Search endpoint error rate | `< 1%` | `0.00%` | `PASS` |
| Studio mutation endpoint error rate | `< 1%` | `0.00%` | `PASS` |
| Harvest `429` rate | `< 10%` | `92.11%` | `FAIL` |
| Search p95 latency | `< 1,200 ms` | `760 ms` | `PASS` |
| Studio generate p95 latency | `< 1,000 ms` | `78 ms` | `PASS` |

## Decision
- Overall tuned profile status: `CONDITIONAL FAIL` because harvest throttling is far above pilot gate.
- Pilot-safe interpretation:
  - Core user flows (search/studio/recommendations) are stable at this load.
  - Harvest requires lower effective concurrency, queue-first UX, and/or policy tuning before ramp.

---

## Run Metadata (Queue + Cache + Tuned Limits)
- Date: `2026-02-08`
- Profile: `pilot_tuned_cache_queue180_20260208`
- Driver: `infra/loadtest/locustfile.py`
- Scenario command:
  - `USERS=40 SPAWN_RATE=8 DURATION=5m RUN_ID=pilot_tuned_cache_queue180_20260208 bash ./infra/loadtest/run_loadtest.sh http://127.0.0.1:8000`
- Tuning changes in this run:
  - Auth-aware rate-limit bucketing (no IP-only collapse).
  - `RATE_LIMIT_AUTO_HARVEST_PER_MINUTE` default raised to `180`.
  - `harvest_auto` load scenario switched to `enqueue=true`.
  - Auto-harvest crawl-result cache added (5-minute TTL).
- Artifacts:
  - `infra/loadtest/results/pilot_tuned_cache_queue180_20260208_stats.csv`
  - `infra/loadtest/results/pilot_tuned_cache_queue180_20260208_failures.csv`
  - `infra/loadtest/results/pilot_tuned_cache_queue180_20260208.html`

## Headline Results (Queue + Cache + Tuned Limits)
- Total requests: `11,144`
- Total failures: `0`
- Aggregate error rate: `0.00%`
- Aggregate throughput: `37.17 req/s`
- Aggregate p95 latency: `1100 ms`
- Aggregate p99 latency: `2000 ms`

## Endpoint Detail (Queue + Cache + Tuned Limits)
| Endpoint name | Requests | Failures | Error rate | Avg (ms) | p95 (ms) | p99 (ms) |
|---|---:|---:|---:|---:|---:|---:|
| `recipes_search` | 2,343 | 0 | 0.00% | 246.00 | 940 | 1700 |
| `harvest_auto` | 799 | 0 | 0.00% | 301.00 | 1300 | 2000 |
| `studio_create_session` | 1,593 | 0 | 0.00% | 327.00 | 1400 | 2200 |
| `studio_create_constraint` | 1,591 | 0 | 0.00% | 198.00 | 930 | 1600 |
| `studio_generate` | 1,590 | 0 | 0.00% | 157.00 | 730 | 1700 |
| `studio_summary` | 805 | 0 | 0.00% | 845.00 | 2100 | 2600 |
| `studio_versions` | 1,590 | 0 | 0.00% | 65.00 | 330 | 780 |
| `recommendations_make_now` | 793 | 0 | 0.00% | 303.00 | 1100 | 1900 |
| `auth/dev-token` | 40 | 0 | 0.00% | 193.00 | 750 | 750 |

## Gate Results (Queue + Cache + Tuned Limits)
| Gate | Target | Actual | Result |
|---|---|---|---|
| Non-harvest aggregate error rate | `< 2%` | `0.00%` | `PASS` |
| Search endpoint error rate | `< 1%` | `0.00%` | `PASS` |
| Studio mutation endpoint error rate | `< 1%` | `0.00%` | `PASS` |
| Harvest `429` rate | `< 10%` | `0.00%` | `PASS` |
| Search p95 latency | `< 1,200 ms` | `940 ms` | `PASS` |
| Studio generate p95 latency | `< 1,000 ms` | `730 ms` | `PASS` |

## Decision (Queue + Cache + Tuned Limits)
- Overall status: `PASS` for the defined pilot performance gates in this profile.
- Remaining caution:
  - `studio_summary` remains comparatively heavy and should stay under telemetry watch in staging.

## Pilot Gate Lock (Derived From Passing Tuned Run)
- Date: `2026-02-08`
- Source run: `pilot_tuned_cache_queue180_20260208`
- Source stats: `infra/loadtest/results/pilot_tuned_cache_queue180_20260208_stats.csv`
- Locked gate file: `infra/loadtest/gates.pilot.locked.json`
- Lock report: `infra/loadtest/results/pilot_tuned_cache_queue180_20260208_locked_gates.md`
- Locked evaluation report: `infra/loadtest/results/pilot_tuned_cache_queue180_20260208_locked_eval.md`

### Locked Thresholds
| Gate | Previous | Locked |
|---|---:|---:|
| `non_harvest_error_rate_max` | `0.02` | `0.005` |
| `harvest_429_rate_max` | `0.1` | `0.05` |
| `search_error_rate_max` | `0.01` | `0.003` |
| `studio_generate_error_rate_max` | `0.01` | `0.003` |
| `search_p95_ms_max` | `1200` | `1121` |
| `studio_generate_p95_ms_max` | `1000` | `879` |
| `aggregate_p95_ms_max` | `1500` | `1325` |

### Lock Validation
- Evaluation result against locked thresholds: `PASS`
- Command:
  - `python3 ./infra/loadtest/evaluate_gates.py --stats infra/loadtest/results/pilot_tuned_cache_queue180_20260208_stats.csv --gates infra/loadtest/gates.pilot.locked.json --run-id pilot_tuned_cache_queue180_20260208_locked --output-md infra/loadtest/results/pilot_tuned_cache_queue180_20260208_locked_eval.md`
