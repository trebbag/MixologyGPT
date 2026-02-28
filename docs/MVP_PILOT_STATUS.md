# MVP Pilot Status

Last updated: `2026-02-24` (post all-six continuation automation pass)

## Completion by Core Pilot Area
| Area | Percent complete | Ready state summary |
|---|---:|---|
| Core API platform (auth, models, CRUD, migrations) | 92% | Core services are stable with migrations and targeted integration coverage; calibration/reporting/admin telemetry endpoints are exercised and operational. Remaining work is final pilot hardening under real staging traffic and incident drill replay. |
| Inventory + ontology operations | 92% | Inventory flows remain functional and tested across web/mobile shell paths. Remaining work is workflow tightening on long-tail edit/delete paths and final mobile parity polish. |
| Recipe harvesting + compliance controls | 99% | Per-domain policy admin, confidence scoring, fallback telemetry, calibration apply (`MIN_JOBS >= 20/domain`), rejection-path smoke, and safe recovery patch automation are in place. Remaining work is production-like staging failure collection and policy-reviewed domain hardening from real failure classes. |
| Studio generation + review workflow | 90% | Session/version/guided flows are implemented on web and mobile, and tertiary offline/disabled states cover harvest/review/studio actions in automated tests. Remaining work is representative real-staging soak plus summary-query optimization under load. |
| Recommendations + party/pilot utility | 79% | Recommendations/Party/Knowledge sections are wired in the Figma shell and backend unlock scoring is functional. Remaining work is deeper UX polish and export-oriented pilot workflows. |
| Web UI readiness (Figma parity) | 99% | Web shell covers all major nav sections, deep-link harvest tertiary states, and now explicit offline-disabled behavior for Studio Sessions/Session actions and Knowledge actions. Remaining work is cosmetic parity polish and design-system consistency sweep. |
| Mobile UI readiness (Figma parity) | 98% | Mobile harvest/review/studio/knowledge long-tail permutations (retry/deferred/offline/error and deep-link entry paths) are covered in mocked E2E. Remaining work is final visual micro-polish in tertiary action surfaces. |
| QA automation (unit/integration/contract/E2E) | 99% | API unit/integration harvest suites pass, web Playwright includes tertiary offline paths, and non-mocked staging suites are wired for web+mobile execution (`test:e2e:staging`) and integrated into full all-six orchestration. Remaining work is executing those suites against real staging credentials. |
| Staging deploy + observability | 99% | Staging stack, dashboards, alert rules, calibration, and smoke scripts are operational; dedicated workflows now include one-shot all-six orchestration (`staging-pilot-all-six.yml`) in addition to alert smoke, policy maintenance, recovery maintenance, E2E matrix, and real signoff. Latest local checkpoint: `docs/runbooks/evidence/pilot-readiness-mvp8-local-2026-02-24.md`. Remaining work is internal staging validation under representative traffic; external forwarding is optional. |
| Performance readiness for pilot load | 98% | Additional tuned local profile (`local_second_profile_20260224_161736`) passed against locked gates. Remaining work is explicit go/no-go on a representative **non-local** staging traffic window. |

## Remaining Work Before Pilot
1. Populate real staging secrets and run `.github/workflows/staging-pilot-all-six.yml` (or `infra/staging/pilot_all_six.sh`) for one-shot execution of all six items with evidence artifacts (internal alert path is sufficient).
2. Re-run tuned load profile on a representative real staging traffic window and record explicit go/no-go against current locked gates (do not rely on local-only runs).
3. Keep `.github/workflows/staging-policy-maintenance.yml` enabled (hourly) and review calibration artifacts for threshold drift.
4. Keep `.github/workflows/staging-recovery-maintenance.yml` enabled and apply only safe keys; require policy review for any compliance-impacting relaxations.
5. Review non-mocked web/mobile staging E2E artifacts from the all-six run for deep-link/offline/disabled/retry/error tertiary paths.
6. Capture final pilot decision memo with links to signoff summary, load gate report, alert smoke logs, and E2E artifacts.

## Dependency Items Blocking Full Pilot Launch
1. Staging secrets and host access details (see `docs/NEEDS_FROM_YOU.md`).
2. Final approved source allowlist + legal/compliance sign-off.
3. Go/no-go owner confirmation after real staging signoff artifacts are reviewed.
