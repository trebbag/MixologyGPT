# MVP Pilot Status

Last updated: `2026-02-28` (after pilot domain defaults update + CI pgvector fix)

## Completion by Core Pilot Area
| Area | Percent complete | Ready state summary |
|---|---:|---|
| Core API platform (auth, models, CRUD, migrations) | 94% | Core APIs are stable, migrations are in place, and CI migration coverage now targets a pgvector-capable Postgres image. Remaining work is full real-staging rerun validation. |
| Inventory + ontology operations | 92% | Core inventory and ontology flows are stable across web/mobile. Remaining work is long-tail UX parity and edge-case flow polish. |
| Recipe harvesting + compliance controls | 96% | Policy admin, telemetry, calibration automation, compliance rejection paths, and safe recovery patch automation are implemented. Remaining work is sustained real-staging telemetry on all approved domains and policy-reviewed parser hardening from live failure classes. |
| Studio generation + review workflow | 91% | Session, version, review, and tertiary action handling are implemented across web/mobile. Remaining work is final staging validation of disabled/offline/retry/error permutations on real credentials. |
| Recommendations + party/pilot utility | 83% | Endpoints and primary UI surfaces are in place. Remaining work is pilot-focused UX polish and operational end-to-end journey validation under staging traffic. |
| Web UI readiness (Figma parity) | 95% | Design language and major route coverage are in place, including staging E2E hooks and runtime API override support. Remaining work is final parity sweep in tertiary/edge states after staging token+host correction. |
| Mobile UI readiness (Figma parity) | 94% | Multi-screen navigation and tertiary-path handling are implemented and covered by mocked suites. Remaining work is real-staging execution and final deep-link/permutation polish. |
| QA automation (unit/integration/contract/E2E) | 96% | API unit/integration/contract coverage is established, plus web/mobile E2E (mocked and staging variants). Remaining work is passing real-staging E2E with valid token/role and collecting current artifacts. |
| Staging deploy + observability | 91% | Signoff, all-six orchestration, calibration, recovery maintenance, and in-app alert path are wired. Remaining work is environment-secret completion, real-staging reruns, and final evidence capture. |
| Performance readiness for pilot load | 93% | Locked pilot gates and tuned profile tooling are in place. Remaining work is second representative staging-window run and explicit go/no-go decision against locked gates. |

## Remaining Work Before Pilot
1. Regenerate `STAGING_E2E_ACCESS_TOKEN` with `power` or `admin` role and update GitHub secret.
   - Current blocker: all-six precheck on `2026-02-28` failed with `401` on `/v1/auth/sessions` and `/v1/users/me`.
2. Redeploy staging web with current code and confirm it no longer points to `localhost` for API calls.
   - Confirm `STAGING_WEB_BASE_URL` build/runtime points at real staging API host.
3. Re-run `.github/workflows/staging-pilot-all-six.yml` and archive full evidence artifacts.
4. Execute staged performance signoff in a representative traffic window and record explicit go/no-go against `infra/loadtest/gates.pilot.locked.json`.
5. Keep low-sample approved domains at `MIN_JOBS >= 20/domain` (including `liquor.com` when active policy exists) and periodically re-apply calibration.
6. Run recovery patch preview from live failure classes and apply only safe parser keys.
7. Publish final pilot decision memo linking signoff summary, load-gate report, compliance smoke, and staging web/mobile E2E artifacts.

## Dependency Items Blocking Full Pilot Launch
1. Staging credentials/secrets and host config in `docs/NEEDS_FROM_YOU.md` (especially `STAGING_BASE_URL`, `STAGING_INTERNAL_TOKEN`, `STAGING_E2E_ACCESS_TOKEN`, `STAGING_WEB_BASE_URL`).
2. Active approved source-policy coverage for target pilot domains (now excluding allrecipes by default pilot targets; liquor optional when policy is active).
3. Final go/no-go owner signoff after real staging evidence is collected.
