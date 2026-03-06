# Staging Redeploy Sequence

Last updated: `2026-03-06`

Use this sequence after the latest runtime hardening changes land on the remote branch. The goal is to redeploy staging with the correct build-time web API URL, then regenerate the signoff evidence on the same code revision.

## Preconditions
- GitHub Actions secrets are set:
  - `STAGING_SSH_HOST`
  - `STAGING_SSH_USER`
  - `STAGING_SSH_KEY`
  - `STAGING_GHCR_TOKEN`
  - `STAGING_DEPLOY_PATH`
  - `STAGING_BASE_URL`
  - `STAGING_WEB_BASE_URL` if web and API use different public origins
  - optional override: `STAGING_NEXT_PUBLIC_API_URL`
  - optional override: `STAGING_CORS_ALLOWED_ORIGINS`
- Staging host already contains `/Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging/.env.staging` with real non-local values.
- Your local branch is committed and pushed before dispatching workflows. Running the workflows before pushing will test the old remote revision.

## Local verification before push
From `/Users/gregorygabbert/Documents/GitHub/BartenderAI`:

```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/web
npm run lint
npm run build
npm run test:runtime-config

cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/mobile
npm run typecheck
npm run test:e2e -- appAuthGate.test.tsx runtimeConfig.test.tsx journey.test.tsx

cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/services/api
source .venv/bin/activate
pytest -q

cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/services/workers
PYTHONPATH=. ../api/.venv/bin/python -m unittest discover -s tests -v
```

## Push the code revision
Example:

```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI
git status
git add .
git commit -m "Harden staging runtime deploy and mobile auth"
git push origin <your-branch-or-main>
```

## 1. Deploy staging
If the staging API and web are on different hosts:

```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI
gh workflow run staging-deploy.yml --ref <branch-or-main>
gh run watch --exit-status
```

Optional wrapper for the full deploy -> signoff -> all-six sequence:

```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI
DEPLOY_REF=<branch-or-main> \
BASE_URL=https://<staging-api-host> \
WEB_BASE_URL=https://<staging-web-host> \
./infra/staging/run_ci_sequence.sh
```

What this now validates:
- web Docker build receives `NEXT_PUBLIC_API_URL` at build time
- host `.env.staging` is updated with `ENVIRONMENT`, `NEXT_PUBLIC_API_URL`, and `CORS_ALLOWED_ORIGINS`
- `infra/staging/validate_runtime_env.py` passes on-host
- `infra/staging/runtime_surface_smoke.py` passes against the live staging API/web pair

## 2. Re-run staged load + gate signoff

```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI
gh workflow run staging-signoff.yml \
  --ref <branch-or-main> \
  -f base_url="https://<staging-api-host>" \
  -f web_base_url="https://<staging-web-host>"
gh run watch --exit-status
```

Expected outputs:
- runtime surface smoke passes before the load profile starts
- locked gate evaluation is generated from the deployed staging host

## 3. Re-run full all-six pilot validation

```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI
gh workflow run staging-pilot-all-six.yml \
  --ref <branch-or-main> \
  -f base_url="https://<staging-api-host>" \
  -f web_base_url="https://<staging-web-host>" \
  -f users="40" \
  -f spawn_rate="8" \
  -f duration="5m" \
  -f min_jobs="20"
gh run watch --exit-status
```

What this covers:
- pilot real signoff path
- non-mocked web staging E2E
- non-mocked mobile staging E2E
- compliance rejection smoke
- runtime surface precheck in `infra/staging/pilot_all_six.sh`

## 4. Collect evidence and decide go/no-go
Record the fresh run ids and compare them against:
- `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/MVP_PILOT_STATUS.md`
- `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/NEEDS_FROM_YOU.md`
- `/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/staging-signoff-decision-2026-03-03.md`

For the crawler warning-quality follow-up, review telemetry after the next staging crawl window:

```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging
API_BASE_URL=https://<staging-api-host> \
INTERNAL_TOKEN=<token> \
python3 ./review_crawler_warning_signal.py \
  --min-jobs 20 \
  --output-md /Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence/crawler-warning-review.md
```

Minimum expected outcome:
- `Staging Deploy`: PASS
- `Staging Sign-Off (Load + Gates)`: PASS
- `Staging Pilot All-Six`: PASS

If all three are PASS on the same revision, the remaining blocker is owner go/no-go.
