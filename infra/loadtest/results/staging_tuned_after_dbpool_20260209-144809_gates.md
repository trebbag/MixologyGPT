# Load Gate Evaluation (staging_tuned_after_dbpool_20260209-144809)

- Stats file: `infra/loadtest/results/staging_tuned_after_dbpool_20260209-144809_stats.csv`
- Gates file: `infra/loadtest/gates.json`
- Total requests: `5409`
- Total failures: `0`
- Overall result: `FAIL`

| Metric | Actual | Threshold | Result |
|---|---:|---:|---|
| `non_harvest_error_rate` | `0.0000` | `0.02` | `PASS` |
| `harvest_429_rate` | `0.0000` | `0.1` | `PASS` |
| `search_error_rate` | `0.0000` | `0.01` | `PASS` |
| `studio_generate_error_rate` | `0.0000` | `0.01` | `PASS` |
| `search_p95_ms` | `900.0000` | `1200` | `PASS` |
| `studio_generate_p95_ms` | `860.0000` | `1000` | `PASS` |
| `aggregate_p95_ms` | `2300.0000` | `1500` | `FAIL` |
