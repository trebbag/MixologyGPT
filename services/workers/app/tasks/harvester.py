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
def process_harvest_job(job_id: str):
    with httpx.Client() as client:
        response = client.post(
            f"{settings.api_url}/v1/recipes/harvest/jobs/{job_id}/run",
            headers={"X-Internal-Token": settings.internal_token},
            timeout=30.0,
        )
    _report_job("process_harvest_job", "ok", f"job {job_id}")
    return {"status": "ok", "job_id": job_id, "response": response.json()}


@celery_app.task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def sweep_harvest_jobs(limit: int = 20):
    with httpx.Client() as client:
        response = client.get(
            f"{settings.api_url}/v1/recipes/harvest/jobs/pending",
            headers={"X-Internal-Token": settings.internal_token},
            params={"limit": limit},
            timeout=30.0,
        )
        jobs = response.json() if response.status_code == 200 else []
        for job in jobs:
            job_id = job.get("id")
            if job_id:
                process_harvest_job.delay(job_id)
    _report_job("sweep_harvest_jobs", "ok", f"queued {len(jobs)}")
    return {"status": "ok", "queued": len(jobs)}


@celery_app.task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def sweep_source_policies(limit: int = 50):
    queued = 0
    warnings = 0
    with httpx.Client() as client:
        response = client.get(
            f"{settings.api_url}/v1/recipes/harvest/policies",
            headers={"X-Internal-Token": settings.internal_token},
            params={"limit": limit},
            timeout=20.0,
        )
        policies = response.json() if response.status_code == 200 else []
        for policy in policies:
            seed_urls = policy.get("seed_urls") or []
            for seed in seed_urls:
                auto_res = client.post(
                    f"{settings.api_url}/v1/recipes/harvest/auto",
                    headers={"X-Internal-Token": settings.internal_token},
                    json={
                        "source_url": seed,
                        "source_type": "web",
                        "max_links": policy.get("max_pages", 40),
                        "max_pages": policy.get("max_pages", 40),
                        "max_recipes": policy.get("max_recipes", 20),
                        "crawl_depth": policy.get("crawl_depth", 2),
                        "respect_robots": policy.get("respect_robots", True),
                        "enqueue": True,
                    },
                    timeout=60.0,
                )
                if auto_res.status_code == 200:
                    payload = auto_res.json()
                    queued += len(payload.get("queued_job_ids", []))
                    parser_stats = payload.get("parser_stats") or {}
                    parse_failure_counts = payload.get("parse_failure_counts") or {}
                    parsed_count = max(int(payload.get("parsed_count") or 0), 1)
                    fallback = int(parser_stats.get("dom_fallback", 0))
                    fallback_rate = fallback / parsed_count
                    parse_failure_total = sum(int(value or 0) for value in parse_failure_counts.values())
                    parse_failure_rate = parse_failure_total / parsed_count
                    compliance_rejections = int(payload.get("compliance_rejections") or 0)
                    alert_settings = policy.get("alert_settings") or {}
                    try:
                        max_fallback_rate = float(alert_settings.get("max_parser_fallback_rate", 0.6))
                    except (TypeError, ValueError):
                        max_fallback_rate = 0.6
                    try:
                        max_compliance_rejections = int(alert_settings.get("max_compliance_rejections", 5))
                    except (TypeError, ValueError):
                        max_compliance_rejections = 5
                    try:
                        max_parse_failure_rate = float(alert_settings.get("max_parse_failure_rate", 0.3))
                    except (TypeError, ValueError):
                        max_parse_failure_rate = 0.3
                    if (
                        fallback_rate > max_fallback_rate
                        or parse_failure_rate > max_parse_failure_rate
                        or compliance_rejections > max_compliance_rejections
                    ):
                        warnings += 1
    status_value = "warning" if warnings else "ok"
    _report_job("sweep_source_policies", status_value, f"queued {queued}; warnings {warnings}")
    return {"status": status_value, "queued": queued, "warnings": warnings}


@celery_app.task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def retry_failed_harvest_jobs(limit: int = 20):
    retried = 0
    with httpx.Client() as client:
        response = client.get(
            f"{settings.api_url}/v1/recipes/harvest/jobs/retryable",
            headers={"X-Internal-Token": settings.internal_token},
            params={"limit": limit},
            timeout=20.0,
        )
        jobs = response.json() if response.status_code == 200 else []
        for job in jobs:
            job_id = job.get("id")
            if job_id:
                process_harvest_job.delay(job_id)
                retried += 1
    _report_job("retry_failed_harvest_jobs", "ok", f"queued {retried}")
    return {"status": "ok", "queued": retried}


@celery_app.task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def calibrate_source_policy_alerts(
    min_jobs: int | None = None,
    buffer_multiplier: float | None = None,
):
    if not settings.enable_alert_calibration:
        _report_job("calibrate_source_policy_alerts", "skipped", "disabled")
        return {"status": "skipped", "reason": "disabled"}

    min_jobs_value = int(min_jobs or settings.alert_calibration_min_jobs or 20)
    buffer_value = float(buffer_multiplier or settings.alert_calibration_buffer_multiplier or 1.25)

    try:
        with httpx.Client() as client:
            response = client.post(
                f"{settings.api_url}/v1/admin/source-policies/calibrate-alerts",
                headers={"X-Internal-Token": settings.internal_token},
                params={
                    "apply": "true",
                    "min_jobs": str(min_jobs_value),
                    "buffer_multiplier": str(buffer_value),
                },
                json={},
                timeout=60.0,
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:  # noqa: BLE001
        _report_job("calibrate_source_policy_alerts", "error", type(exc).__name__)
        raise

    updated = payload.get("updated_domains") if isinstance(payload, dict) else None
    updated_count = len(updated) if isinstance(updated, list) else 0
    _report_job(
        "calibrate_source_policy_alerts",
        "ok",
        f"updated {updated_count} domains (min_jobs={min_jobs_value} buffer={buffer_value})",
    )
    return payload
