from celery import Celery

from app.config import settings


celery_app = Celery(
    "bartenderai",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.autodiscover_tasks(["app.tasks"])

beat_schedule = {
    "expiry-reminders-hourly": {
        "task": "app.tasks.notifications.send_expiry_reminders",
        "schedule": 60.0 * 60.0,
    },
    "restock-reminders-hourly": {
        "task": "app.tasks.notifications.send_restock_reminders",
        "schedule": 60.0 * 60.0,
    },
    "harvest-sweep-5m": {
        "task": "app.tasks.harvester.sweep_harvest_jobs",
        "schedule": 60.0 * 5.0,
    },
    "harvest-source-policies-60m": {
        "task": "app.tasks.harvester.sweep_source_policies",
        "schedule": 60.0 * 60.0,
    },
    "harvest-retry-10m": {
        "task": "app.tasks.harvester.retry_failed_harvest_jobs",
        "schedule": 60.0 * 10.0,
    },
}

if settings.enable_alert_calibration:
    beat_schedule["source-policy-alert-calibration"] = {
        "task": "app.tasks.harvester.calibrate_source_policy_alerts",
        "schedule": float(settings.alert_calibration_interval_seconds),
    }

celery_app.conf.update(
    task_track_started=True,
    worker_send_task_events=True,
    task_send_sent_event=True,
    beat_schedule=beat_schedule,
)
