# Load Gate Evaluation (second_tuned_local_20260213_212718)

- Stats file: `docs/runbooks/evidence/second_tuned_local_20260213_212718_stats.csv`
- Gates file: `infra/loadtest/gates.pilot.locked.json`
- Total requests: `705`
- Total failures: `0`
- Overall result: `PASS`

| Metric | Actual | Threshold | Result |
|---|---:|---:|---|
| `non_harvest_error_rate` | `0.0000` | `0.005` | `PASS` |
| `harvest_429_rate` | `0.0000` | `0.05` | `PASS` |
| `search_error_rate` | `0.0000` | `0.003` | `PASS` |
| `studio_generate_error_rate` | `0.0000` | `0.003` | `PASS` |
| `search_p95_ms` | `25.0000` | `700` | `PASS` |
| `studio_generate_p95_ms` | `30.0000` | `600` | `PASS` |
| `aggregate_p95_ms` | `45.0000` | `900` | `PASS` |
