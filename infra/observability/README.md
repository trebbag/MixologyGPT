# Observability Stack

This folder provides a lightweight Prometheus + Grafana + Alertmanager stack for local dashboards and alert simulation.

## Run
```bash
export ALERT_WEBHOOK_URL=http://host.docker.internal:5001/alerts
docker compose -f infra/observability/docker-compose.yml up
```

## Access
- Prometheus: http://localhost:9090
- Alertmanager: http://localhost:9093
- Grafana: http://localhost:3001 (default user/pass: admin/admin)

Auto-provisioned dashboards:
- `BartenderAI API`
- `BartenderAI Crawler Ops`

Alert rules:
- API latency and 5xx error rate
- Crawler retry backlog and parser fallback/failure rates

## Alert smoke validation
```bash
./infra/observability/validate_alerting.sh
```
Use this to post a synthetic alert to Alertmanager and verify end-to-end receiver delivery.
