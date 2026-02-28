# Load Gate Evaluation (staging_tuned_20260213-145622)

- Stats file: `infra/loadtest/results/staging_tuned_20260213-145622_stats.csv`
- Gates file: `infra/loadtest/gates.pilot.locked.json`
- Total requests: `1456`
- Total failures: `0`
- Overall result: `PASS`

| Metric | Actual | Threshold | Result |
|---|---:|---:|---|
| `non_harvest_error_rate` | `0.0000` | `0.005` | `PASS` |
| `harvest_429_rate` | `0.0000` | `0.05` | `PASS` |
| `search_error_rate` | `0.0000` | `0.003` | `PASS` |
| `studio_generate_error_rate` | `0.0000` | `0.003` | `PASS` |
| `search_p95_ms` | `19.0000` | `700` | `PASS` |
| `studio_generate_p95_ms` | `13.0000` | `600` | `PASS` |
| `aggregate_p95_ms` | `18.0000` | `900` | `PASS` |
