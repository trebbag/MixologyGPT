# Load Gate Evaluation (local_smoke_20260209_recipesfix)

- Stats file: `infra/loadtest/results/local_smoke_20260209_recipesfix_stats.csv`
- Gates file: `infra/loadtest/gates.json`
- Total requests: `642`
- Total failures: `0`
- Overall result: `PASS`

| Metric | Actual | Threshold | Result |
|---|---:|---:|---|
| `non_harvest_error_rate` | `0.0000` | `0.02` | `PASS` |
| `harvest_429_rate` | `0.0000` | `0.1` | `PASS` |
| `search_error_rate` | `0.0000` | `0.01` | `PASS` |
| `studio_generate_error_rate` | `0.0000` | `0.01` | `PASS` |
| `search_p95_ms` | `52.0000` | `1200` | `PASS` |
| `studio_generate_p95_ms` | `43.0000` | `1000` | `PASS` |
| `aggregate_p95_ms` | `150.0000` | `1500` | `PASS` |
