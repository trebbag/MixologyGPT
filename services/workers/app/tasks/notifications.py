import httpx

from app.celery_app import celery_app
from app.config import settings


def _report_job(name: str, status: str, message: str | None = None) -> None:
    with httpx.Client() as client:
        client.post(
            f"{settings.api_url}/v1/admin/system-jobs/{name}",
            headers={"X-Internal-Token": settings.internal_token},
            json={"status": status, "message": message},
            timeout=10.0,
        )


@celery_app.task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def send_expiry_reminders():
    with httpx.Client() as client:
        response = client.post(
            f"{settings.api_url}/v1/notifications/refresh",
            headers={"X-Internal-Token": settings.internal_token},
            timeout=10.0,
        )
    _report_job("send_expiry_reminders", "ok", None)
    return {"status": "ok", "task": "send_expiry_reminders", "response": response.json()}


@celery_app.task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def send_restock_reminders():
    with httpx.Client() as client:
        response = client.post(
            f"{settings.api_url}/v1/notifications/refresh",
            headers={"X-Internal-Token": settings.internal_token},
            timeout=10.0,
        )
    _report_job("send_restock_reminders", "ok", None)
    return {"status": "ok", "task": "send_restock_reminders", "response": response.json()}
