# Load Gate Evaluation (staging_tuned_lock_20260209-143207)

- Stats file: `infra/loadtest/results/staging_tuned_lock_20260209-143207_stats.csv`
- Gates file: `infra/loadtest/gates.json`
- Total requests: `7111`
- Total failures: `0`
- Overall result: `FAIL`

| Metric | Actual | Threshold | Result |
|---|---:|---:|---|
| `non_harvest_error_rate` | `0.0000` | `0.02` | `PASS` |
| `harvest_429_rate` | `0.0000` | `0.1` | `PASS` |
| `search_error_rate` | `0.0000` | `0.01` | `PASS` |
| `studio_generate_error_rate` | `0.0000` | `0.01` | `PASS` |
| `search_p95_ms` | `1800.0000` | `1200` | `FAIL` |
| `studio_generate_p95_ms` | `2300.0000` | `1000` | `FAIL` |
| `aggregate_p95_ms` | `3300.0000` | `1500` | `FAIL` |
