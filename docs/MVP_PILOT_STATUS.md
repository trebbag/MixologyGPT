# MVP Pilot Status

Last updated: `2026-03-01` (after all-six pass + liquor policy activation + weekly drift review)

## Completion by Core Pilot Area
| Area | Percent complete | Ready state summary |
|---|---:|---|
| Core API platform (auth, models, CRUD, migrations) | 96% | Core APIs, migrations, and CI coverage are stable, including pgvector-aware migration smoke. Remaining work is routine hardening and post-pilot defect burn-down. |
| Inventory + ontology operations | 93% | Inventory and ontology flows are stable across web/mobile shells. Remaining work is minor UX polish on long-tail state transitions. |
| Recipe harvesting + compliance controls | 97% | Policy admin, telemetry, calibration, compliance rejection smoke, and safe recovery patching are operational in staging. Liquor policy is now active, but current liquor seeds return `http-403` so that domain cannot yet meet `MIN_JOBS` telemetry targets. |
| Studio generation + review workflow | 94% | Staging pass now validates tertiary retry/offline/disabled paths across the integrated flow. Remaining work is polish-level UX refinement. |
| Recommendations + party/pilot utility | 85% | Core endpoint + UI integration is in place and exercised by load/profile runs. Remaining work is pilot UX quality improvements and export/report ergonomics. |
| Web UI readiness (Figma parity) | 97% | Staging web E2E now passes in all-six, including tertiary knowledge/studio/harvest interactions. Remaining work is visual consistency cleanup and final accessibility sweep. |
| Mobile UI readiness (Figma parity) | 96% | Mobile staging tertiary suite passes in all-six with offline/disabled/retry states. Remaining work is micro-interaction polish and optional navigation refinements. |
| QA automation (unit/integration/contract/E2E) | 98% | CI + staging all-six now pass with real credentials and artifact capture. Remaining work is expanding long-tail E2E permutations and keeping suites fast/reliable. |
| Staging deploy + observability | 95% | Real signoff passes via all-six; internal alert path is validated as optional-internal mode. Remaining work is optional external alert forwarding and environment-specific deploy workflow alignment. |
| Performance readiness for pilot load | 96% | Staging load profile now passes locked gates in integrated signoff. Remaining work is periodic reruns to detect drift before pilot scale increases. |

## Remaining Work Before Pilot
1. Confirm explicit final owner approval in `docs/runbooks/evidence/pilot-decision-memo-2026-03-01.md`.
2. Resolve `liquor.com` crawlability for pilot calibration:
   - provide crawlable/approved liquor seed URLs, or
   - explicitly exclude liquor from `MIN_JOBS` gate enforcement until access constraints are resolved.
3. Keep policy/recovery maintenance running and review weekly drift evidence (`Staging Weekly Drift Review` workflow).
4. Optional: wire external alert forwarding destinations (Slack/PagerDuty) if you want off-platform paging; internal mode is already valid.
5. Optional: align or disable the SSH-based `Staging Deploy` workflow if Render is your canonical deployment path.

## Dependency Items Blocking Full Pilot Launch
1. Final owner signoff on pilot go/no-go with evidence package attached.
2. Decision on liquor domain handling (`liquor.com` seeds/crawlability vs temporary gate exclusion).
3. Decision on optional external alert forwarding requirements (internal-only is already supported).
