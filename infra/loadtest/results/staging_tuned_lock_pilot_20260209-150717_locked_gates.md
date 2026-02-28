# Locked Gates (staging_tuned_lock_pilot_20260209-150717)

- Source stats: `infra/loadtest/results/staging_tuned_lock_pilot_20260209-150717_stats.csv`
- Source gates: `infra/loadtest/gates.json`
- Locked gates: `infra/loadtest/gates.pilot.locked.json`

| Gate | Previous | Locked |
|---|---:|---:|
| `non_harvest_error_rate_max` | `0.02` | `0.005` |
| `harvest_429_rate_max` | `0.1` | `0.05` |
| `search_error_rate_max` | `0.01` | `0.003` |
| `studio_generate_error_rate_max` | `0.01` | `0.003` |
| `search_p95_ms_max` | `1200` | `700` |
| `studio_generate_p95_ms_max` | `1000` | `600` |
| `aggregate_p95_ms_max` | `1500` | `900` |
