from app.celery_app import celery_app
from app.internal_api import report_job_status, request_internal


@celery_app.task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def send_expiry_reminders():
    try:
        response = request_internal(
            "POST",
            "/v1/notifications/refresh",
            timeout=10.0,
        )
    except Exception as exc:  # noqa: BLE001
        report_job_status("send_expiry_reminders", "error", str(exc))
        raise

    report_job_status("send_expiry_reminders", "ok", None)
    return {"status": "ok", "task": "send_expiry_reminders", "response": response.payload}


@celery_app.task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def send_restock_reminders():
    try:
        response = request_internal(
            "POST",
            "/v1/notifications/refresh",
            timeout=10.0,
        )
    except Exception as exc:  # noqa: BLE001
        report_job_status("send_restock_reminders", "error", str(exc))
        raise

    report_job_status("send_restock_reminders", "ok", None)
    return {"status": "ok", "task": "send_restock_reminders", "response": response.payload}
