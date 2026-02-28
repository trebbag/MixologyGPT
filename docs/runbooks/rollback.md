# Deployment Rollback Runbook

## Purpose
Rollback API/worker/web to last known-good staging image tag.

## Preconditions
- Last healthy image tag is known.
- Staging host has access to GHCR and deploy path.

## Rollback Steps
1. SSH to staging host and go to deploy directory.
2. Set explicit image tags:
   - `export API_IMAGE=ghcr.io/<owner>/bartenderai-api:<known-good-tag>`
   - `export WORKER_IMAGE=ghcr.io/<owner>/bartenderai-workers:<known-good-tag>`
   - `export WEB_IMAGE=ghcr.io/<owner>/bartenderai-web:<known-good-tag>`
3. Pull and restart stack:
   - `cd infra/staging`
   - `docker compose -f docker-compose.staging.yml pull`
   - `docker compose -f docker-compose.staging.yml up -d`
4. Run migrations only if rollback target schema is compatible:
   - `docker compose -f docker-compose.staging.yml exec -T api alembic upgrade head`

## Verification
1. `curl -fsS <staging-base-url>/health`
2. `curl -fsS <staging-base-url>/metrics | head`
3. Smoke user journeys in web/mobile mocked flows.
4. Confirm alerts clear and no new critical error spikes.

## Roll-forward Guard
Do not re-deploy latest tag until root cause is identified and validated in staging smoke.
