# Load Gate Evaluation (pilot_staging_second_local_20260214)

- Stats file: `infra/loadtest/results/pilot_staging_second_local_20260214_stats.csv`
- Gates file: `infra/loadtest/gates.pilot.locked.json`
- Total requests: `14593`
- Total failures: `0`
- Overall result: `PASS`

| Metric | Actual | Threshold | Result |
|---|---:|---:|---|
| `non_harvest_error_rate` | `0.0000` | `0.005` | `PASS` |
| `harvest_429_rate` | `0.0000` | `0.05` | `PASS` |
| `search_error_rate` | `0.0000` | `0.003` | `PASS` |
| `studio_generate_error_rate` | `0.0000` | `0.003` | `PASS` |
| `search_p95_ms` | `17.0000` | `700` | `PASS` |
| `studio_generate_p95_ms` | `30.0000` | `600` | `PASS` |
| `aggregate_p95_ms` | `34.0000` | `900` | `PASS` |
