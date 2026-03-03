# MVP Pilot Status

Last updated: `2026-03-03` (policy baseline freeze + pilot ops drill passed; second staged load signoff is NO-GO on two p95 gates)

## Completion by Core Pilot Area
| Area | Percent complete | Ready state summary |
|---|---:|---|
| Core API platform (auth, models, CRUD, migrations) | 97% | Core APIs and migrations are stable; clean-DB migration smoke was re-validated (`core-api-migration-smoke-20260303_010256.md`). Remaining work is routine hardening and post-pilot defect burn-down. |
| Inventory + ontology operations | 95% | Web/mobile inventory flows now include explicit offline/disabled tertiary states and E2E coverage. Remaining work is minor visual polish only. |
| Recipe harvesting + compliance controls | 99% | Policy maintenance + weekly drift review succeeded on staging with `MIN_JOBS >= 20` on approved domains and a frozen baseline (`policy-baseline-freeze-2026-03-03.md`). |
| Studio generation + review workflow | 95% | Tertiary offline/retry/disabled flows are covered in staging and mocked suites. Remaining work is latency reduction under load, not feature completeness. |
| Recommendations + party/pilot utility | 92% | Recommendations now include offline-safe controls and snapshot export on web/mobile. Remaining work is final UX polish and optional analytics refinements. |
| Web UI readiness (Figma parity) | 98% | Additional tertiary-state parity is implemented (inventory/recommendations offline + export paths) and covered by Playwright E2E. |
| Mobile UI readiness (Figma parity) | 97% | Additional tertiary-state parity is implemented for inventory/recommendations and covered by mobile E2E suites. |
| QA automation (unit/integration/contract/E2E) | 99% | Expanded web/mobile E2E matrices pass locally and all-six staging remains green; ops drill workflow is now codified and passing. |
| Staging deploy + observability | 98% | Policy maintenance, weekly drift review, and pilot ops drill all pass in GitHub Actions with evidence artifacts. |
| Performance readiness for pilot load | 90% | Second staged signoff run (`22603893539`) is `FAIL` against locked gates (`search_p95_ms=730>700`, `studio_generate_p95_ms=1100>600`); explicit decision is NO-GO until remediated. |

## Remaining Work Before Pilot
1. Fix staged performance regressions and clear locked gates:
   - bring `search_p95_ms` under `700`
   - bring `studio_generate_p95_ms` under `600`
   - rerun `Staging Sign-Off (Load + Gates)` and require `Overall result: PASS`
2. Re-run `Staging Pilot All-Six` after performance fixes to confirm end-to-end readiness with the same traffic profile.
3. Keep hourly policy maintenance + weekly drift review active and continue reviewing generated evidence.
4. Confirm final owner go/no-go decision after a passing staged signoff run.

## Dependency Items Blocking Full Pilot Launch
1. Performance gate pass against `infra/loadtest/gates.pilot.locked.json` on real staging traffic.
2. Final owner signoff on pilot go/no-go with evidence package attached.
