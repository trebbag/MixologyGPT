# Load Gate Evaluation (pilot_signoff_20260213_localhost)

- Stats file: `infra/loadtest/results/pilot_signoff_20260213_localhost_stats.csv`
- Gates file: `infra/loadtest/gates.pilot.locked.json`
- Total requests: `14692`
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
| `aggregate_p95_ms` | `17.0000` | `900` | `PASS` |
