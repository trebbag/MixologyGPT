# Staging Deployment

This folder contains the staging stack definition used by the GitHub Actions staging deployment workflow.

## Services
- API (`services/api` image)
- Workers (`services/workers` image)
- Web (`apps/web` image)
- Postgres + Redis
- Prometheus + Alertmanager + Grafana

## Required setup on the staging host
1. Clone this repository on the host.
2. Copy `.env.staging.example` to `.env.staging` and set real values.
   - `ALERT_WEBHOOK_URL` should point Alertmanager to the in-cluster alert receiver (default is `http://alert-receiver:5001/alerts`).
   - Configure real downstream incident destinations on the receiver:
     - `SLACK_WEBHOOK_URL` (Slack Incoming Webhook)
     - `PAGERDUTY_ROUTING_KEY` (PagerDuty Events v2 routing key)
     - `FORWARD_WEBHOOK_URLS` (optional additional webhook endpoints)
3. Ensure Docker Engine + Docker Compose plugin are installed.

## Manual run
```bash
cd infra/staging
export API_IMAGE=ghcr.io/<owner>/bartenderai-api:<tag>
export WORKER_IMAGE=ghcr.io/<owner>/bartenderai-workers:<tag>
export WEB_IMAGE=ghcr.io/<owner>/bartenderai-web:<tag>
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d
docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T api alembic upgrade head
```

## Observability endpoints
- Prometheus: `:9090`
- Alertmanager: `:9093`
- Grafana: `:3001`

## Validate alert wiring
1. Trigger a synthetic alert:
   - `curl -X POST http://localhost:9093/api/v2/alerts -H 'Content-Type: application/json' -d '[{\"labels\":{\"alertname\":\"StagingSmokeAlert\",\"severity\":\"warning\"},\"annotations\":{\"summary\":\"staging alert smoke\"}}]'`
2. Confirm Alertmanager accepted it:
   - `curl http://localhost:9093/api/v2/alerts/groups`
3. Confirm your receiver endpoint logs/incident destination receives the alert notification.
4. Optional external confirmation polling:
   - Confirm receiver received the alert:
     - `ALERTMANAGER_URL=http://localhost:9093 CONFIRM_BASE_URL=http://localhost:5001 ./external_alert_smoke.sh`
   - Confirm receiver forwarded to a downstream destination:
     - Slack: `ALERTMANAGER_URL=http://localhost:9093 CONFIRM_BASE_URL=http://localhost:5001 CONFIRM_FORWARD_DESTINATION=slack ./external_alert_smoke.sh`
     - PagerDuty: `ALERTMANAGER_URL=http://localhost:9093 CONFIRM_BASE_URL=http://localhost:5001 CONFIRM_FORWARD_DESTINATION=pagerduty ./external_alert_smoke.sh`
   - If you set `ALERT_RECEIVER_CONFIRM_TOKEN`, include it as `CONFIRM_TOKEN=<token>`.

## Calibrate source-policy thresholds from staging telemetry
After crawler traffic accumulates, generate recommendations (preview only):
```bash
INTERNAL_TOKEN=<internal-token> \
API_BASE_URL=http://localhost:8000 \
APPLY=false \
./calibrate_alert_thresholds.sh
```

Apply the recommended thresholds into policy `alert_settings`:
```bash
INTERNAL_TOKEN=<internal-token> \
API_BASE_URL=http://localhost:8000 \
APPLY=true \
./calibrate_alert_thresholds.sh
```

## Boost low-sample domains to MIN_JOBS and drain pending jobs
When calibration is skipping domains due to low sample size, use:
```bash
INTERNAL_TOKEN=<internal-token> \
API_BASE_URL=http://localhost:8000 \
MIN_JOBS=20 \
python3 ./boost_crawl_volume.py
```

Then drain the queued jobs so telemetry reflects real parse/compliance/failure classes:
```bash
INTERNAL_TOKEN=<internal-token> \
API_BASE_URL=http://localhost:8000 \
python3 ./drain_pending_jobs.py
```

## Pilot ops drill (calibration + alert smoke + optional load gates)
```bash
INTERNAL_TOKEN=<internal-token> \
API_BASE_URL=http://localhost:8000 \
ALERTMANAGER_URL=http://localhost:9093 \
APPLY_CALIBRATION=false \
RUN_LOAD_PROFILE=false \
LOCK_GATES=false \
ALERT_CONFIRM_URL=https://<optional-confirm-endpoint> \
ALERT_CONFIRM_TOKEN=<optional> \
./pilot_ops_drill.sh
```

## Real staging sign-off wrapper
Use this when you have real staging endpoints + real alert destination secrets. The wrapper blocks local endpoints and dummy PagerDuty keys:
```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI
API_BASE_URL=https://<staging-host> \
ALERTMANAGER_URL=https://<alertmanager-host> \
ALERT_CONFIRM_URL=https://<alert-receiver>/smoke/confirm \
INTERNAL_TOKEN=<internal-token> \
SLACK_WEBHOOK_URL=<slack-webhook> \
PAGERDUTY_ROUTING_KEY=<pagerduty-key> \
./infra/staging/pilot_real_signoff.sh
```

## Full all-six continuation wrapper
Use this to run all six remaining pilot items in one flow:
- real signoff (alerts + calibration + recovery + load gates)
- staging web E2E
- staging mobile E2E
- staging compliance rejection smoke

```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI
API_BASE_URL=https://<staging-host> \
ALERTMANAGER_URL=https://<alertmanager-host> \
ALERT_CONFIRM_URL=https://<alert-receiver>/smoke/confirm \
INTERNAL_TOKEN=<internal-token> \
SLACK_WEBHOOK_URL=<slack-webhook> \
PAGERDUTY_ROUTING_KEY=<pagerduty-key> \
STAGING_E2E_ACCESS_TOKEN=<e2e-access-token> \
./infra/staging/pilot_all_six.sh
```

## Rejection path smoke
Validate that a known non-recipe URL is rejected (compliance or parse/fetch rejection class):
```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/infra/staging
API_BASE_URL=http://localhost:8000 \
INTERNAL_TOKEN=<internal-token> \
COMPLIANCE_TEST_URL=https://www.allrecipes.com/privacy-policy \
python3 ./compliance_rejection_smoke.py
```
