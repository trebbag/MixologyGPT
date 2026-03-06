# MVP Pilot Status

Last updated: `2026-03-06` (post-push staging validation found live CORS mismatch + missing deploy secrets; crawler warning review is clean)

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
| Staging deploy + observability | 91% | Current live blocker is the staging API/web runtime mismatch: `Staging Sign-Off` run `22783919469` failed because the API returned `400 Disallowed CORS origin` for `https://mixologygpt-app.onrender.com`. The separate `Staging Deploy` workflow remains optional if Render native deploys are your source of truth. |
| Performance readiness for pilot load | 95% | The last locked-gate PASS (`22605681114`) is still valid historical evidence, but a fresh run on the current deployed revision is blocked until live runtime smoke passes again. |

## Runtime Hardening Status
| Area | Percent complete | Ready state summary |
|---|---:|---|
| API/runtime hardening | 92% | The code now rejects default non-local auth/runtime settings, but the live staging API still fails preflight from the web origin (`400 Disallowed CORS origin`) and must be reconfigured/redeployed before runtime hardening can be considered pilot-ready. |
| Web/mobile runtime readiness | 94% | Web API base resolution and mobile login flows are implemented, but the current deployed API/web pair fails runtime surface smoke because the API does not allow the live web origin. |
| Harvest ops reliability | 96% | Worker tasks propagate internal API failures, and source-policy sweeps now surface calibrated crawler telemetry alerts instead of only local heuristics. Remaining work is observing the warning/error signal quality over a fresh staging crawl window. |
| Recommendation/query efficiency | 92% | Hot recommendation endpoints now batch recipe ingredient and equivalency loads instead of per-recipe lookups. Remaining work is validating performance against a fresh staging profile and deciding whether to add cache/index work for larger datasets. |
| Deploy automation | 86% | The GitHub staging deploy workflow is implemented, but its latest run (`22783809188`) shows the repo still lacks SSH/GHCR deploy secrets. This only matters if you want GitHub-driven deploys instead of Render native deploys. |

## Remaining Work Before Pilot
1. Fix the live staging API CORS/runtime configuration so `https://mixologygpt-app.onrender.com` is accepted as an allowed origin, then redeploy the API/web pair in Render.
2. Re-run the updated staging validation set after the CORS fix/redeploy:
   - `Staging Deploy`
   - `Staging Sign-Off (Load + Gates)` with runtime surface smoke
   - `Staging Pilot All-Six`
3. Confirm owner go/no-go pilot decision using the refreshed PASS evidence bundle after those reruns succeed.
4. Keep hourly policy maintenance + weekly drift review active. The latest crawler warning review (`22784025139`) is clean with no actionable alerts and all approved domains at `MIN_JOBS >= 20`.
5. Only if you want GitHub-driven staging deploys, populate the missing deploy secrets (`STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY`, `STAGING_GHCR_TOKEN`, `STAGING_DEPLOY_PATH`).

## Dependency Items Blocking Full Pilot Launch
1. Fix live staging runtime/CORS so the API accepts the live web origin.
2. Refresh staging evidence after the CORS fix/redeploy so runtime-surface validation, all-six, and calibrated crawler warnings are represented in the final pilot packet.
3. Final owner signoff on pilot go/no-go with the refreshed evidence package attached.
4. If GitHub-driven staging deploys matter for your ops model, populate the missing deploy secrets and execute the deploy workflow once.
