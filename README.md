# BartenderAI

Home bar inventory + verified recipe library + AI mixology creator.

## Repo layout
- `apps/mobile`: React Native (Expo) consumer app
- `apps/web`: Next.js web app (Studio/admin)
- `services/api`: FastAPI backend
- `services/workers`: Celery workers
- `services/ai_agents`: agent services (inventory steward, harvester, creator, balance)
- `packages/shared_types`: shared schemas/types
- `infra/docker`: local dev Docker Compose
- `docs`: specifications and data model notes

## Quick start (local)
1. Start infrastructure:
   ```bash
   docker compose -f infra/docker/docker-compose.yml up -d
   ```
2. Backend:
   ```bash
   cd services/api
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   PYTHONPATH=. alembic upgrade head
   uvicorn app.main:app --reload
   ```
   Get a dev token:
   ```bash
   curl -X POST http://localhost:8000/v1/auth/dev-token
   ```
   Local dev login (email/password):
   - The dev-token endpoint seeds a local-only admin user on first call.
   - Credentials: `dev@bartender.ai` / `dev-password`
   - Login endpoint: `POST /v1/auth/jwt/login`
   Embeddings provider (optional):
   - Default: hash-based embeddings for local dev.
   - To use OpenAI embeddings, set `EMBEDDINGS_PROVIDER=openai` and `OPENAI_API_KEY`.
3. Workers:
   ```bash
   cd services/workers
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   celery -A app.celery_app worker --loglevel=info
   ```
4. Web:
   ```bash
   cd apps/web
   npm install
   npm run dev
   ```
   Optional: enable the “Local Dev Login (Dev Token)” button on the web login screen:
   - Set `NEXT_PUBLIC_ALLOW_DEV_TOKEN=true` in `apps/web/.env.local`
5. Mobile:
   ```bash
   cd apps/mobile
   npm install
   npm run start
   ```

## Docs
See `docs/SPEC.md` and `docs/DATA_MODEL.md`.
Pilot readiness tracking:
- `docs/MVP_PILOT_STATUS.md`
- `docs/NEEDS_FROM_YOU.md`

Operational runbooks:
- `docs/runbooks/crawler-kill-switch.md`
- `docs/runbooks/incident-response.md`
- `docs/runbooks/rollback.md`

## Observability
- Prometheus metrics are exposed when `ENABLE_METRICS=true` (default).
- OpenTelemetry export via `OTLP_ENDPOINT` (optional).
- Local dashboards are provided in `infra/observability`.

## Load Testing
Use Locust from `infra/loadtest`:
```bash
pip install -r infra/loadtest/requirements.txt
locust -f infra/loadtest/locustfile.py --host http://localhost:8000
```
- Latest report: `infra/loadtest/REPORT.md`.
- Headless run helper: `infra/loadtest/run_loadtest.sh`.
