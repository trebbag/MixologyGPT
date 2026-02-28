# Load Gate Evaluation (pilot_realistic_20260213_165732)

- Stats file: `infra/loadtest/results/pilot_realistic_20260213_165732_stats.csv`
- Gates file: `infra/loadtest/gates.json`
- Total requests: `14683`
- Total failures: `0`
- Overall result: `PASS`

| Metric | Actual | Threshold | Result |
|---|---:|---:|---|
| `non_harvest_error_rate` | `0.0000` | `0.02` | `PASS` |
| `harvest_429_rate` | `0.0000` | `0.1` | `PASS` |
| `search_error_rate` | `0.0000` | `0.01` | `PASS` |
| `studio_generate_error_rate` | `0.0000` | `0.01` | `PASS` |
| `search_p95_ms` | `20.0000` | `1200` | `PASS` |
| `studio_generate_p95_ms` | `19.0000` | `1000` | `PASS` |
| `aggregate_p95_ms` | `21.0000` | `1500` | `PASS` |
