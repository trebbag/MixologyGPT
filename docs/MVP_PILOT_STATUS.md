# MVP Pilot Status

Last updated: `2026-03-06` (runtime deploy validation + mobile auth gate + calibrated crawler warning follow-up + agent runtime fail-fast cleanup landed)

## Completion by Core Pilot Area
| Area | Percent complete | Ready state summary |
|---|---:|---|
| Core API platform (auth, models, CRUD, migrations) | 98% | Core APIs and migrations are stable; clean-DB migration smoke remains green (`core-api-migration-smoke-20260303_010256.md`). |
| Inventory + ontology operations | 96% | Web/mobile inventory flows include explicit offline/disabled tertiary states and E2E coverage; only minor polish remains. |
| Recipe harvesting + compliance controls | 99% | Policy maintenance + weekly drift review succeeded on staging with `MIN_JOBS >= 20` on approved domains and a frozen baseline (`policy-baseline-freeze-2026-03-03.md`). |
| Studio generation + review workflow | 97% | Tertiary offline/retry/disabled flows are covered in staging and mocked suites, and locked-gate staged load has passed. |
| Recommendations + party/pilot utility | 93% | Recommendations include offline-safe controls and snapshot export on web/mobile; remaining work is polish and optional analytics refinements. |
| Web UI readiness (Figma parity) | 98% | Additional tertiary-state parity is implemented (inventory/recommendations offline + export paths) and covered by Playwright E2E. |
| Mobile UI readiness (Figma parity) | 99% | Tertiary review/harvest offline paths are covered, staging mobile matrix is green, and non-local mobile builds now have a real login/logout/session-restore path. |
| QA automation (unit/integration/contract/E2E) | 99% | Unit/integration suites are green locally and the latest all-six staging run (`22606179707`) is PASS. |
| Staging deploy + observability | 96% | Signoff/all-six/policy maintenance workflows are green, and deploy/signoff now validate build-time API wiring plus runtime API/web surface health; remaining work is one redeploy through the updated CI path with populated secrets. |
| Performance readiness for pilot load | 98% | Locked-gate staged signoff is PASS (`22605681114`: `search_p95_ms=140`, `studio_generate_p95_ms=240`, `aggregate_p95_ms=200`). |

## Runtime Hardening Status
| Area | Percent complete | Ready state summary |
|---|---:|---|
| API/runtime hardening | 97% | API/workers/agent clients now reject default non-local auth/runtime settings, and CORS is explicit rather than wildcard+credentials. Remaining work is production secret population and final staging validation after redeploy. |
| Web/mobile runtime readiness | 97% | Web API base resolution is centralized, staging deploy now passes the API URL into the web build, runtime surface smoke validates API/web/CORS, and mobile has a real login/logout/session-restore path. Remaining work is a fresh staging redeploy and signoff run through the updated pipeline. |
| Harvest ops reliability | 96% | Worker tasks propagate internal API failures, and source-policy sweeps now surface calibrated crawler telemetry alerts instead of only local heuristics. Remaining work is observing the warning/error signal quality over a fresh staging crawl window. |
| Recommendation/query efficiency | 92% | Hot recommendation endpoints now batch recipe ingredient and equivalency loads instead of per-recipe lookups. Remaining work is validating performance against a fresh staging profile and deciding whether to add cache/index work for larger datasets. |
| Deploy automation | 92% | The staging deploy workflow now builds the web bundle with an explicit public API URL, syncs runtime env updates onto the host, and validates runtime env + API/web surface before signoff. Remaining work is populating any missing deploy secrets and executing a fresh CI-driven redeploy. |

## Remaining Work Before Pilot
1. Complete one fresh staging redeploy through the updated CI path by setting any missing deploy secrets (`STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY`, `STAGING_GHCR_TOKEN`, `STAGING_DEPLOY_PATH`, plus `STAGING_WEB_BASE_URL` when web is on a separate host).
2. Re-run the updated staging validation set after redeploy:
   - `Staging Deploy`
   - `Staging Sign-Off (Load + Gates)` with runtime surface smoke
   - `Staging Pilot All-Six`
3. Confirm owner go/no-go pilot decision using the refreshed PASS evidence bundle:
   - `Staging Sign-Off (Load + Gates)` run `22605681114`
   - `Staging Pilot All-Six` run `22606179707`
4. Keep hourly policy maintenance + weekly drift review active and continue reviewing calibrated crawler warning drift after the next staging traffic window.

## Dependency Items Blocking Full Pilot Launch
1. Final owner signoff on pilot go/no-go with evidence package attached.
2. If CI-driven staging deploy is required for pilot ops, populate staging deploy secrets and execute the updated deploy workflow once.
3. Refresh staging evidence after redeploy so runtime-surface validation and calibrated crawler warnings are represented in the final pilot packet.
