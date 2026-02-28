# Pilot Readiness Checkpoint (MVP7 Local + Staging Automation)

Date: `2026-02-24`
Scope: Execute all six remaining readiness items where possible from local context, and add staging automation for non-local execution.

## 1) Real alert destination wiring + external smoke
- Local validation guard executed:
  - `infra/staging/pilot_real_signoff.sh` rejected local endpoint usage (`API_BASE_URL=http://localhost:8000`) as expected.
- Result: **blocked for real execution** until non-local staging secrets/endpoints are provided.

## 2) Real staging signoff orchestration
- Added CI workflow to run full real signoff end-to-end:
  - `.github/workflows/staging-pilot-real-signoff.yml`
- Added dedicated alert smoke workflow:
  - `.github/workflows/staging-alert-smoke.yml`
- Added strict wrapper script (already present, now enforced in workflow):
  - `infra/staging/pilot_real_signoff.sh`

## 3) Second tuned profile + gate check
- Executed local tuned profile (representative mechanics; not a substitute for real staging window):
  - Run ID: `local_second_profile_20260224_161736`
  - Result: **PASS**
  - Gate report: `infra/loadtest/results/local_second_profile_20260224_161736_gates.md`
  - Stats/artifacts:
    - `docs/runbooks/evidence/local_second_profile_20260224_161736_stats.csv`
    - `docs/runbooks/evidence/local_second_profile_20260224_161736_stats_history.csv`
    - `docs/runbooks/evidence/local_second_profile_20260224_161736.html`

## 4) Sustain low-sample domains + periodic calibration
- Executed local boost + calibration apply:
  - `staging-boost-crawl-local_20260224_161720_boost.json`
  - `calibration-apply-local_20260224_161720_boost.json`
- Final job counts (all `>=20/domain`):
  - `allrecipes.com=37`
  - `bbcgoodfood.com=40`
  - `diffordsguide.com=30`
  - `food.com=26`
  - `imbibemagazine.com=57`
  - `punchdrink.com=28`
- Added hourly maintenance workflow:
  - `.github/workflows/staging-policy-maintenance.yml`

## 5) Recovery patch promotion from real failure classes
- Executed local preview/apply:
  - `staging-recovery-patches-local_20260224_161724_recovery_preview.json`
  - `staging-recovery-patches-local_20260224_161728_recovery_apply.json`
- Result: no supported failure classes currently observed (all domains skipped, no safe patches applied).
- Added recurring workflow for preview/apply-safe:
  - `.github/workflows/staging-recovery-maintenance.yml`

## 6) Expanded non-mocked staging E2E matrix (web + mobile)
- Added web non-mocked staging suite + config:
  - `apps/web/tests/e2e-staging/tertiary.staging.spec.ts`
  - `apps/web/playwright.staging.config.ts`
  - `apps/web/package.json` script: `test:e2e:staging`
- Added mobile non-mocked staging suite + config:
  - `apps/mobile/tests/e2e-staging/tertiary.staging.test.tsx`
  - `apps/mobile/jest.staging.config.js`
  - `apps/mobile/package.json` script: `test:e2e:staging`
  - `apps/mobile/src/app/useAppController.ts` supports `STAGING_E2E_ACCESS_TOKEN` / `EXPO_PUBLIC_E2E_ACCESS_TOKEN` bootstrap token.
- Added staging matrix workflow:
  - `.github/workflows/staging-e2e-matrix.yml`
- Added rejection-path smoke utility for staging API:
  - `infra/staging/compliance_rejection_smoke.py`

## Current blocker to full non-local completion
- Real staging execution still requires:
  - non-local `STAGING_BASE_URL`
  - `STAGING_INTERNAL_TOKEN`
  - `STAGING_SLACK_WEBHOOK_URL`
  - `STAGING_PAGERDUTY_ROUTING_KEY` (non-dummy)
  - `STAGING_ALERTMANAGER_URL`
  - `STAGING_ALERT_RECEIVER_CONFIRM_URL` (plus token if enforced)
  - `STAGING_E2E_ACCESS_TOKEN`
