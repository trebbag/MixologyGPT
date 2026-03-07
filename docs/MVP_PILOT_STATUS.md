# MVP Pilot Status

Last updated: `2026-03-07` (Render runtime smoke fixed, staging signoff PASS, all-six PASS, AI inventory batch upload now has mobile parity, lookup telemetry/cache, and ontology audit queue)

## Completion by Core Pilot Area
| Area | Percent complete | Ready state summary |
|---|---:|---|
| Core API platform (auth, models, CRUD, migrations) | 98% | Core APIs and migrations are stable; clean-DB migration smoke remains green (`core-api-migration-smoke-20260303_010256.md`). |
| Inventory + ontology operations | 99% | Inventory now includes AI-assisted batch upload preview/import on web and mobile, lookup telemetry/cache, duplicate-safe reuse of ingredients/items/lots, and an admin ontology audit queue for imported ingredient entries. Remaining work is rollout-only: run migration `0020`, redeploy live environments, and execute the rollout helper/runbook to verify the audit queue live. |
| Recipe harvesting + compliance controls | 99% | Policy maintenance + weekly drift review succeeded on staging with `MIN_JOBS >= 20` on approved domains and a frozen baseline (`policy-baseline-freeze-2026-03-03.md`). |
| Studio generation + review workflow | 97% | Tertiary offline/retry/disabled flows are covered in staging and mocked suites, and locked-gate staged load has passed. |
| Recommendations + party/pilot utility | 93% | Recommendations include offline-safe controls and snapshot export on web/mobile; remaining work is polish and optional analytics refinements. |
| Web UI readiness (Figma parity) | 99% | Additional tertiary-state parity is implemented, including AI-assisted inventory batch upload, lookup telemetry summaries, and admin ontology review controls. |
| Mobile UI readiness (Figma parity) | 99% | Tertiary review/harvest offline paths are covered, non-local mobile builds have a real login/logout/session-restore path, and mobile inventory now supports both paste-first and native file-picker AI batch upload preview/import. |
| QA automation (unit/integration/contract/E2E) | 99% | Unit/integration suites are green locally, `Staging Sign-Off (Load + Gates)` run `22787611593` is PASS, and `Staging Pilot All-Six` run `22788567113` is PASS. |
| Staging deploy + observability | 96% | Live Render runtime smoke now passes for `https://mixologygpt.onrender.com` + `https://mixologygpt-app.onrender.com`. Remaining gap is only the optional GitHub SSH/GHCR deploy path if you want Actions-driven staging deploys instead of Render native deploys. |
| Performance readiness for pilot load | 98% | Fresh locked-gate staging signoff passed on run `22787611593`, and the embedded signoff inside `22788567113` also passed with zero failures. |

## Runtime Hardening Status
| Area | Percent complete | Ready state summary |
|---|---:|---|
| API/runtime hardening | 97% | Non-local config validation is in place, Render now accepts the deployed web origin, and live runtime surface smoke passes. Remaining work is low-risk cleanup around test warnings and dependency hygiene rather than runtime blockers. |
| Web/mobile runtime readiness | 97% | Web API base resolution, mobile login/session restore, and mobile staging bootstrap all work against live staging. Remaining work is polish: remove React test `act(...)` warnings and continue broadening tertiary-path matrices. |
| Harvest ops reliability | 96% | Worker tasks propagate internal API failures, and source-policy sweeps now surface calibrated crawler telemetry alerts instead of only local heuristics. Remaining work is observing the warning/error signal quality over a fresh staging crawl window. |
| Recommendation/query efficiency | 92% | Hot recommendation endpoints now batch recipe ingredient and equivalency loads instead of per-recipe lookups. Remaining work is validating performance against a fresh staging profile and deciding whether to add cache/index work for larger datasets. |
| Deploy automation | 86% | The GitHub staging deploy workflow is implemented, but its latest run (`22783809188`) shows the repo still lacks SSH/GHCR deploy secrets. This only matters if you want GitHub-driven deploys instead of Render native deploys. |

## Remaining Work Before Pilot
1. Run API migration `0020_add_inventory_batch_upload_audits` and redeploy API/web/mobile in the environments where you want the new inventory audit queue and mobile batch upload available.
2. Execute `/Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging/inventory_batch_upload_rollout.sh` against the live environment to confirm batch preview/import + admin audit queue behavior after deploy.
3. Confirm owner go/no-go pilot decision using the refreshed PASS evidence bundle:
   - `Staging Sign-Off (Load + Gates)` run `22787611593`
   - `Staging Pilot All-Six` run `22788567113`
4. Keep hourly policy maintenance + weekly drift review active. The latest crawler warning review (`22784025139`) is clean with no actionable alerts and all approved domains at `MIN_JOBS >= 20`.
5. Only if you want GitHub-driven staging deploys, populate the missing deploy secrets (`STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY`, `STAGING_GHCR_TOKEN`, `STAGING_DEPLOY_PATH`).
6. Optional engineering follow-up after pilot readiness:
   - remove React Native test `act(...)` warnings from staging mobile suites
   - audit and reduce npm vulnerability noise in web/mobile dependency trees
   - decide whether recommendation endpoints need cache/index work before higher traffic tiers

## Dependency Items Blocking Full Pilot Launch
1. Apply migration `0020_add_inventory_batch_upload_audits` in the live environment(s) that will run this build, then redeploy.
2. Run the inventory batch upload rollout verification helper/runbook on that deployed revision.
3. Final owner signoff on pilot go/no-go with the refreshed evidence package attached.
4. If GitHub-driven staging deploys matter for your ops model, populate the missing deploy secrets and execute the deploy workflow once.
