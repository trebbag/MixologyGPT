# Project Commands

- Install:
  - API: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/services/api && python3 -m venv .venv && source .venv/bin/activate && python3 -m pip install -r requirements.txt`
  - Workers: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/services/workers && python3 -m venv .venv && source .venv/bin/activate && python3 -m pip install -r requirements.txt`
  - Web (Node 20.x recommended): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/web && npm install`
  - Mobile: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/mobile && npm install`

- Dev / Run:
  - API: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/services/api && source .venv/bin/activate && uvicorn app.main:app --reload`
  - Workers: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/services/workers && source .venv/bin/activate && celery -A app.celery_app worker -B --loglevel=info`
  - Web: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/web && npm run dev`
  - Mobile: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/mobile && npm run start`

- Lint:
  - Web: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/web && npm run lint`

- Format:
  - No dedicated formatter command is currently configured.

- Typecheck:
  - Mobile: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/mobile && npm run typecheck`

- Test (unit):
  - API: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/services/api && source .venv/bin/activate && pytest tests/unit -q`

- Test (integration/e2e):
  - API integration + contract: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/services/api && source .venv/bin/activate && pytest tests/integration tests/contract -q`
  - Web e2e: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/web && npm run test:e2e` (Playwright auto-starts the web server from `playwright.config.ts`; requires a compatible Node version for `next build`.)
  - Web staging e2e (non-mocked, uses staging host + token): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/web && E2E_BASE_URL=https://<staging-host> STAGING_E2E_ACCESS_TOKEN=<token> npm run test:e2e:staging`
  - Web e2e (docker-built server): `docker build -f /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/web/Dockerfile -t bartenderai-web:local /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/web && docker run -d --name bartenderai-web-e2e -p 3100:3000 bartenderai-web:local && cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/web && E2E_BASE_URL=http://localhost:3100 npm run test:e2e && docker rm -f bartenderai-web-e2e`
  - Mobile e2e (mocked): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/mobile && npm run test:e2e`
  - Mobile staging e2e smoke (non-mocked API + UI assertions): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/mobile && STAGING_E2E_API_URL=https://<staging-host> STAGING_E2E_ACCESS_TOKEN=<token> npm run test:e2e:staging`

- Build:
  - Web: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/apps/web && npm run build` (requires Node 20.x; if build hangs or fails on newer Node versions, use the Docker build below)
  - API container: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && docker build -f services/api/Dockerfile -t bartenderai-api:local services/api`
  - Worker container: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && docker build -f services/workers/Dockerfile -t bartenderai-workers:local services/workers`
  - Web container: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && docker build -f apps/web/Dockerfile -t bartenderai-web:local apps/web`

- Database migrations:
  - Upgrade: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/services/api && source .venv/bin/activate && PYTHONPATH=. alembic upgrade head`
  - New revision: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/services/api && source .venv/bin/activate && PYTHONPATH=. alembic revision -m "<message>"`

- Seed/dev data:
  - Default source policies are created via Alembic migrations.

- Start services locally:
  - Infrastructure: `docker compose -f /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/docker/docker-compose.yml up -d`
  - Observability stack: `docker compose -f /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/observability/docker-compose.yml up -d`
  - Staging stack (local images): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging && API_IMAGE=bartenderai-api:local WORKER_IMAGE=bartenderai-workers:local WEB_IMAGE=bartenderai-web:local docker compose --env-file .env.staging -f docker-compose.staging.yml up -d`
  - Staging stack (deployed tags): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging && API_IMAGE=ghcr.io/<owner>/bartenderai-api:<tag> WORKER_IMAGE=ghcr.io/<owner>/bartenderai-workers:<tag> WEB_IMAGE=ghcr.io/<owner>/bartenderai-web:<tag> docker compose --env-file .env.staging -f docker-compose.staging.yml up -d`

- Load/performance test:
  - Install: `python3 -m pip install -r /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/loadtest/requirements.txt`
  - Run headless baseline: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && USERS=20 SPAWN_RATE=4 DURATION=3m ./infra/loadtest/run_loadtest.sh http://127.0.0.1:8000`
  - Run tuned profile: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && USERS=40 SPAWN_RATE=8 DURATION=5m RUN_ID=pilot_tuned_20260208 ./infra/loadtest/run_loadtest.sh http://127.0.0.1:8000`
  - Evaluate gates: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && python3 ./infra/loadtest/evaluate_gates.py --stats infra/loadtest/results/<run_id>_stats.csv --gates infra/loadtest/gates.json --run-id <run_id> --output-md infra/loadtest/results/<run_id>_gates.md`
  - Run staging tuned profile + gate evaluation: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && STAGING_BASE_URL=https://<staging-host> LOADTEST_ACCESS_TOKEN=<staging-access-token> ./infra/loadtest/run_staging_profile.sh`
  - Run staging profile and lock tightened pilot gates: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && STAGING_BASE_URL=https://<staging-host> LOADTEST_ACCESS_TOKEN=<staging-access-token> LOCK_GATES=true ./infra/loadtest/run_staging_profile.sh`
  - Lock gates from an existing run artifact: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && python3 ./infra/loadtest/lock_gates.py --stats infra/loadtest/results/<run_id>_stats.csv --gates-in infra/loadtest/gates.json --gates-out infra/loadtest/gates.pilot.locked.json --run-id <run_id> --output-md infra/loadtest/results/<run_id>_locked_gates.md`

- Alerting operations:
  - Local alert smoke: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && ./infra/observability/validate_alerting.sh`
  - Staging internal alert smoke (in-app path): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging && ALERTMANAGER_URL=https://<alertmanager-host> ./external_alert_smoke.sh`
  - Staging alert smoke with receiver confirmation (optional): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging && ALERTMANAGER_URL=https://<alertmanager-host> CONFIRM_BASE_URL=https://<alert-receiver-host> CONFIRM_TOKEN=<optional> ./external_alert_smoke.sh`
  - Staging external forwarding smoke (optional): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging && ALERTMANAGER_URL=https://<alertmanager-host> CONFIRM_BASE_URL=https://<alert-receiver-host> CONFIRM_FORWARD_DESTINATION=slack CONFIRM_TOKEN=<optional> ./external_alert_smoke.sh`
  - Real staging pilot signoff wrapper (rejects local API endpoints): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && API_BASE_URL=https://<staging-host> INTERNAL_TOKEN=<token> LOADTEST_ACCESS_TOKEN=<staging-access-token> ./infra/staging/pilot_real_signoff.sh`
  - Full all-six pilot continuation (real signoff + web/mobile staging E2E + compliance smoke): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && API_BASE_URL=https://<staging-api-host> WEB_BASE_URL=https://<staging-web-host> INTERNAL_TOKEN=<token> STAGING_E2E_ACCESS_TOKEN=<token> ./infra/staging/pilot_all_six.sh`
  - Staging policy calibration preview: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging && INTERNAL_TOKEN=<token> APPLY=false ./calibrate_alert_thresholds.sh`
  - Staging policy calibration apply: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging && INTERNAL_TOKEN=<token> APPLY=true ./calibrate_alert_thresholds.sh`
  - Drain pending harvest jobs (staging/internal): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging && INTERNAL_TOKEN=<token> API_BASE_URL=http://localhost:8000 python3 ./drain_pending_jobs.py`
  - Full pilot ops drill: `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging && API_BASE_URL=https://<staging-host> INTERNAL_TOKEN=<token> APPLY_CALIBRATION=true RUN_LOAD_PROFILE=true LOCK_GATES=true ALERTMANAGER_URL=https://<optional-alertmanager-host> ALERT_CONFIRM_URL=https://<optional-confirm-url> ALERT_CONFIRM_TOKEN=<optional> DRILL_RUN_ID=<optional-run-id> EVIDENCE_DIR=/Users/gregorygabbert/Documents/GitHub/BartenderAI/docs/runbooks/evidence ./pilot_ops_drill.sh`
  - Rejection path smoke (compliance/parse/fetch rejection): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging && API_BASE_URL=https://<staging-host> INTERNAL_TOKEN=<token> COMPLIANCE_TEST_URL=https://www.diffordsguide.com/encyclopedia/ python3 ./compliance_rejection_smoke.py`

- GitHub Actions workflows (staging):
  - Alert smoke (internal path by default, external forwarding optional): `.github/workflows/staging-alert-smoke.yml`
  - Full real signoff (alerts + calibration + recovery + load gates): `.github/workflows/staging-pilot-real-signoff.yml`
  - Full all-six continuation (real signoff + non-mocked web/mobile staging E2E + compliance smoke): `.github/workflows/staging-pilot-all-six.yml`
  - Hourly domain volume + calibration maintenance: `.github/workflows/staging-policy-maintenance.yml`
  - Recovery preview/apply-safe maintenance: `.github/workflows/staging-recovery-maintenance.yml`
  - Non-mocked web+mobile staging E2E matrix: `.github/workflows/staging-e2e-matrix.yml`
