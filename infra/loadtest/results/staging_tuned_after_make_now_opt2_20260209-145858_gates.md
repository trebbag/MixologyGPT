# Load Gate Evaluation (staging_tuned_after_make_now_opt2_20260209-145858)

- Stats file: `infra/loadtest/results/staging_tuned_after_make_now_opt2_20260209-145858_stats.csv`
- Gates file: `infra/loadtest/gates.json`
- Total requests: `8714`
- Total failures: `76`
- Overall result: `FAIL`

| Metric | Actual | Threshold | Result |
|---|---:|---:|---|
| `non_harvest_error_rate` | `0.0000` | `0.02` | `PASS` |
| `harvest_429_rate` | `0.1234` | `0.1` | `FAIL` |
| `search_error_rate` | `0.0000` | `0.01` | `PASS` |
| `studio_generate_error_rate` | `0.0000` | `0.01` | `PASS` |
| `search_p95_ms` | `46.0000` | `1200` | `PASS` |
| `studio_generate_p95_ms` | `38.0000` | `1000` | `PASS` |
| `aggregate_p95_ms` | `40.0000` | `1500` | `PASS` |
