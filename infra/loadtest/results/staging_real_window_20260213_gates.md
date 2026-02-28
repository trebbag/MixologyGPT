# Load Gate Evaluation (staging_real_window_20260213)

- Stats file: `infra/loadtest/results/staging_real_window_20260213_stats.csv`
- Gates file: `infra/loadtest/gates.pilot.locked.json`
- Total requests: `8756`
- Total failures: `0`
- Overall result: `PASS`

| Metric | Actual | Threshold | Result |
|---|---:|---:|---|
| `non_harvest_error_rate` | `0.0000` | `0.005` | `PASS` |
| `harvest_429_rate` | `0.0000` | `0.05` | `PASS` |
| `search_error_rate` | `0.0000` | `0.003` | `PASS` |
| `studio_generate_error_rate` | `0.0000` | `0.003` | `PASS` |
| `search_p95_ms` | `19.0000` | `700` | `PASS` |
| `studio_generate_p95_ms` | `15.0000` | `600` | `PASS` |
| `aggregate_p95_ms` | `18.0000` | `900` | `PASS` |
