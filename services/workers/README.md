# BartenderAI Workers

Celery workers for notifications and background jobs.

## Config
- `API_URL` (default `http://localhost:8000`)
- `INTERNAL_TOKEN` (default `dev-internal`)

## Tasks
- `send_expiry_reminders`, `send_restock_reminders`
- `sweep_harvest_jobs` (queues pending harvest jobs)
- `sweep_source_policies` (periodic crawl sweeps per source policy)
- `retry_failed_harvest_jobs` (requeues failed harvest jobs)

## Running
Run workers with beat enabled:
```
celery -A app.celery_app worker -B --loglevel=info
```
