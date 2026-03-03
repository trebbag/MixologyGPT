# Load Gate Evaluation (staging_signoff_22603893539)

- Stats file: `infra/loadtest/results/staging_signoff_22603893539_stats.csv`
- Gates file: `infra/loadtest/gates.pilot.locked.json`
- Total requests: `10772`
- Total failures: `18`
- Overall result: `FAIL`

| Metric | Actual | Threshold | Result |
|---|---:|---:|---|
| `non_harvest_error_rate` | `0.0000` | `0.005` | `PASS` |
| `harvest_429_rate` | `0.0223` | `0.05` | `PASS` |
| `search_error_rate` | `0.0000` | `0.003` | `PASS` |
| `studio_generate_error_rate` | `0.0000` | `0.003` | `PASS` |
| `search_p95_ms` | `730.0000` | `700` | `FAIL` |
| `studio_generate_p95_ms` | `1100.0000` | `600` | `FAIL` |
| `aggregate_p95_ms` | `880.0000` | `900` | `PASS` |
