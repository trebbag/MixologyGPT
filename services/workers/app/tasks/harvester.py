import httpx
from typing import Optional

from app.celery_app import celery_app
from app.config import settings
from app.internal_api import InternalApiError, report_job_status, request_internal


@celery_app.task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def process_harvest_job(job_id: str):
    try:
        response = request_internal(
            "POST",
            f"/v1/recipes/harvest/jobs/{job_id}/run",
            timeout=30.0,
        )
    except Exception as exc:  # noqa: BLE001
        report_job_status("process_harvest_job", "error", f"job {job_id}: {exc}")
        raise

    payload = response.payload if isinstance(response.payload, dict) else {}
    job_status = str(payload.get("status") or "ok")
    if job_status == "failed":
        detail = payload.get("error") or payload.get("parse_strategy") or "harvest job failed"
        report_job_status("process_harvest_job", "warning", f"job {job_id}: {detail}")
        return {"status": "warning", "job_id": job_id, "response": payload}

    report_job_status("process_harvest_job", "ok", f"job {job_id}")
    return {"status": "ok", "job_id": job_id, "response": payload}


@celery_app.task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def sweep_harvest_jobs(limit: int = 20):
    try:
        response = request_internal(
            "GET",
            "/v1/recipes/harvest/jobs/pending",
            params={"limit": limit},
            timeout=30.0,
        )
        jobs = response.payload if isinstance(response.payload, list) else []
        for job in jobs:
            job_id = job.get("id")
            if job_id:
                process_harvest_job.delay(job_id)
    except Exception as exc:  # noqa: BLE001
        report_job_status("sweep_harvest_jobs", "error", str(exc))
        raise

    report_job_status("sweep_harvest_jobs", "ok", f"queued {len(jobs)}")
    return {"status": "ok", "queued": len(jobs)}


@celery_app.task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def sweep_source_policies(limit: int = 50):
    queued = 0
    warnings = 0
    failures: list[str] = []
    telemetry_alerts: list[str] = []
    try:
        with httpx.Client() as client:
            response = request_internal(
                "GET",
                "/v1/recipes/harvest/policies",
                client=client,
                params={"limit": limit},
                timeout=20.0,
            )
            policies = response.payload if isinstance(response.payload, list) else []
            for policy in policies:
                seed_urls = policy.get("seed_urls") or []
                for seed in seed_urls:
                    try:
                        auto_response = request_internal(
                            "POST",
                            "/v1/recipes/harvest/auto",
                            client=client,
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
                    except InternalApiError as exc:
                        failures.append(f"{seed}: {exc.detail}")
                        continue

                    payload = auto_response.payload if isinstance(auto_response.payload, dict) else {}
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

            telemetry_response = request_internal(
                "GET",
                "/v1/admin/crawler-ops/telemetry",
                client=client,
                timeout=30.0,
            )
            telemetry_payload = telemetry_response.payload if isinstance(telemetry_response.payload, dict) else {}
            policy_domains = {
                str(policy.get("domain")).strip()
                for policy in policies
                if isinstance(policy, dict) and policy.get("domain")
            }
            for alert in telemetry_payload.get("alerts", []):
                if not isinstance(alert, dict):
                    continue
                domain = str(alert.get("domain") or "").strip()
                if not domain or domain not in policy_domains:
                    continue
                metric = str(alert.get("metric") or "unknown")
                actual = alert.get("actual")
                threshold = alert.get("threshold")
                telemetry_alerts.append(f"{domain}:{metric}={actual}>{threshold}")
    except Exception as exc:  # noqa: BLE001
        report_job_status("sweep_source_policies", "error", str(exc))
        raise

    warnings += len(telemetry_alerts)
    status_value = "ok"
    if failures and not queued:
        status_value = "error"
    elif failures or warnings or telemetry_alerts:
        status_value = "warning"
    message = f"queued {queued}; warnings {warnings}; failures {len(failures)}; telemetry_alerts {len(telemetry_alerts)}"
    if failures:
        message = f"{message}; sample={failures[0]}"
    elif telemetry_alerts:
        message = f"{message}; sample={telemetry_alerts[0]}"
    report_job_status("sweep_source_policies", status_value, message)
    return {
        "status": status_value,
        "queued": queued,
        "warnings": warnings,
        "failures": failures,
        "telemetry_alerts": telemetry_alerts,
    }


@celery_app.task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def retry_failed_harvest_jobs(limit: int = 20):
    retried = 0
    try:
        response = request_internal(
            "GET",
            "/v1/recipes/harvest/jobs/retryable",
            params={"limit": limit},
            timeout=20.0,
        )
        jobs = response.payload if isinstance(response.payload, list) else []
        for job in jobs:
            job_id = job.get("id")
            if job_id:
                process_harvest_job.delay(job_id)
                retried += 1
    except Exception as exc:  # noqa: BLE001
        report_job_status("retry_failed_harvest_jobs", "error", str(exc))
        raise

    report_job_status("retry_failed_harvest_jobs", "ok", f"queued {retried}")
    return {"status": "ok", "queued": retried}


@celery_app.task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def calibrate_source_policy_alerts(
    min_jobs: Optional[int] = None,
    buffer_multiplier: Optional[float] = None,
):
    if not settings.enable_alert_calibration:
        report_job_status("calibrate_source_policy_alerts", "skipped", "disabled")
        return {"status": "skipped", "reason": "disabled"}

    min_jobs_value = int(min_jobs or settings.alert_calibration_min_jobs or 20)
    buffer_value = float(buffer_multiplier or settings.alert_calibration_buffer_multiplier or 1.25)

    try:
        response = request_internal(
            "POST",
            "/v1/admin/source-policies/calibrate-alerts",
            params={
                "apply": "true",
                "min_jobs": str(min_jobs_value),
                "buffer_multiplier": str(buffer_value),
            },
            json={},
            timeout=60.0,
        )
        payload = response.payload if isinstance(response.payload, dict) else {}
    except Exception as exc:  # noqa: BLE001
        report_job_status("calibrate_source_policy_alerts", "error", str(exc))
        raise

    updated = payload.get("updated_domains") if isinstance(payload, dict) else None
    updated_count = len(updated) if isinstance(updated, list) else 0
    report_job_status(
        "calibrate_source_policy_alerts",
        "ok",
        f"updated {updated_count} domains (min_jobs={min_jobs_value} buffer={buffer_value})",
    )
    return payload
