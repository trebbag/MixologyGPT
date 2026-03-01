# MVP Pilot Status

Last updated: `2026-03-01` (after all-six staging pass `22546128104`)

## Completion by Core Pilot Area
| Area | Percent complete | Ready state summary |
|---|---:|---|
| Core API platform (auth, models, CRUD, migrations) | 96% | Core APIs, migrations, and CI coverage are stable, including pgvector-aware migration smoke. Remaining work is routine hardening and post-pilot defect burn-down. |
| Inventory + ontology operations | 93% | Inventory and ontology flows are stable across web/mobile shells. Remaining work is minor UX polish on long-tail state transitions. |
| Recipe harvesting + compliance controls | 98% | Policy admin, telemetry, calibration, compliance rejection smoke, and safe recovery patching are operational in staging. Remaining work is optional domain expansion (`liquor.com`) and ongoing parser tuning from live classes. |
| Studio generation + review workflow | 94% | Staging pass now validates tertiary retry/offline/disabled paths across the integrated flow. Remaining work is polish-level UX refinement. |
| Recommendations + party/pilot utility | 85% | Core endpoint + UI integration is in place and exercised by load/profile runs. Remaining work is pilot UX quality improvements and export/report ergonomics. |
| Web UI readiness (Figma parity) | 97% | Staging web E2E now passes in all-six, including tertiary knowledge/studio/harvest interactions. Remaining work is visual consistency cleanup and final accessibility sweep. |
| Mobile UI readiness (Figma parity) | 96% | Mobile staging tertiary suite passes in all-six with offline/disabled/retry states. Remaining work is micro-interaction polish and optional navigation refinements. |
| QA automation (unit/integration/contract/E2E) | 98% | CI + staging all-six now pass with real credentials and artifact capture. Remaining work is expanding long-tail E2E permutations and keeping suites fast/reliable. |
| Staging deploy + observability | 95% | Real signoff passes via all-six; internal alert path is validated as optional-internal mode. Remaining work is optional external alert forwarding and environment-specific deploy workflow alignment. |
| Performance readiness for pilot load | 96% | Staging load profile now passes locked gates in integrated signoff. Remaining work is periodic reruns to detect drift before pilot scale increases. |

## Remaining Work Before Pilot
1. Publish the final pilot decision memo using evidence from all-six run `22546128104` (summary, signoff, load gates, E2E, compliance smoke).
2. Decide whether to activate `liquor.com` policy in staging (currently skipped because no active policy) or remove it from target-domain defaults.
3. Keep policy/recovery maintenance running and review drift weekly (`MIN_JOBS >= 20/domain`).
4. Optional: wire external alert forwarding destinations (Slack/PagerDuty) if you want off-platform paging; internal mode is already valid.
5. Optional: align or disable the SSH-based `Staging Deploy` workflow if Render is your canonical deployment path.

## Dependency Items Blocking Full Pilot Launch
1. Final owner signoff on pilot go/no-go with evidence package attached.
2. Decision on optional domain coverage (`liquor.com`) for pilot scope.
3. Decision on optional external alert forwarding requirements (internal-only is already supported).
