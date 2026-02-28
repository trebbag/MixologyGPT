# Load Gate Evaluation (pilot_staging_2nd_localhost_20260213_214327)

- Stats file: `infra/loadtest/results/pilot_staging_2nd_localhost_20260213_214327_stats.csv`
- Gates file: `infra/loadtest/gates.json`
- Total requests: `8758`
- Total failures: `0`
- Overall result: `PASS`

| Metric | Actual | Threshold | Result |
|---|---:|---:|---|
| `non_harvest_error_rate` | `0.0000` | `0.02` | `PASS` |
| `harvest_429_rate` | `0.0000` | `0.1` | `PASS` |
| `search_error_rate` | `0.0000` | `0.01` | `PASS` |
| `studio_generate_error_rate` | `0.0000` | `0.01` | `PASS` |
| `search_p95_ms` | `24.0000` | `1200` | `PASS` |
| `studio_generate_p95_ms` | `35.0000` | `1000` | `PASS` |
| `aggregate_p95_ms` | `41.0000` | `1500` | `PASS` |
