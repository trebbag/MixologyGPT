# Load Gate Evaluation (staging_tuned_20260213-160249)

- Stats file: `infra/loadtest/results/staging_tuned_20260213-160249_stats.csv`
- Gates file: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/loadtest/gates.pilot.locked.json`
- Total requests: `14598`
- Total failures: `0`
- Overall result: `PASS`

| Metric | Actual | Threshold | Result |
|---|---:|---:|---|
| `non_harvest_error_rate` | `0.0000` | `0.005` | `PASS` |
| `harvest_429_rate` | `0.0000` | `0.05` | `PASS` |
| `search_error_rate` | `0.0000` | `0.003` | `PASS` |
| `studio_generate_error_rate` | `0.0000` | `0.003` | `PASS` |
| `search_p95_ms` | `22.0000` | `700` | `PASS` |
| `studio_generate_p95_ms` | `17.0000` | `600` | `PASS` |
| `aggregate_p95_ms` | `20.0000` | `900` | `PASS` |
