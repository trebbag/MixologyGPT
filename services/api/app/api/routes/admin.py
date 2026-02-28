from typing import Any, List, Optional
from datetime import datetime
from urllib.parse import urlparse
import re

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_active_admin
from app.core.deps import optional_user
from app.core.config import settings
from app.core.metrics import update_domain_telemetry_gauges
from app.db.models.user import User
from app.db.models.recipe import RecipeHarvestJob, RecipeSourcePolicy
from app.db.models.system import SystemJob
from app.db.session import get_db
from app.schemas.user import UserRead
from app.schemas.source_policy import (
    ParserRecoverySuggestionRequest,
    ParserRecoverySuggestionResponse,
    RecipeSourcePolicyCreate,
    RecipeSourcePolicyRead,
    RecipeSourcePolicyUpdate,
)
from app.schemas.system import SystemJobRead, SystemJobUpdate
from app.domain.harvester_pipeline import build_recovery_parser_settings


router = APIRouter()
PARSE_FAILURE_PATTERN = re.compile(r"parse failed \((?P<class>[a-z0-9_.:-]+)\)", re.IGNORECASE)
FETCH_FAILURE_PATTERN = re.compile(r"fetch_failed \((?P<class>[a-z0-9_.:-]+)\)", re.IGNORECASE)
RECOVERY_SUPPORTED_FAILURES = {
    "domain-selector-mismatch",
    "domain-ingredients-sparse",
    "domain-instructions-sparse",
    "instruction-structure-mismatch",
    "jsonld-parse-failed",
    "jsonld-incomplete",
    "microdata-parse-failed",
    "microdata-incomplete",
    "low-confidence-parse",
    "missing-recipe-markers",
    "insufficient-page-content",
}


def _normalize_parse_failure(parse_failure: str) -> str:
    normalized = (parse_failure or "").strip()
    if not normalized:
        return ""
    for prefix in ("parse_failed:", "dom_fallback:", "recovery:"):
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix) :]
            break
    return normalized.strip()


def _hostname_matches_policy(hostname: str, policy_domain: str) -> bool:
    host = (hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    policy = (policy_domain or "").lower()
    if not host or not policy:
        return False
    return host == policy or host.endswith(f".{policy}")


def _domain_from_url(url: str) -> str:
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if host.startswith("www."):
            return host[4:]
        return host
    except Exception:  # noqa: BLE001
        return ""


def _setting_as_float(settings: dict[str, Any], key: str, default: float) -> float:
    value = settings.get(key)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _setting_as_int(settings: dict[str, Any], key: str, default: int) -> int:
    value = settings.get(key)
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _domain_triage_hints(metric: dict[str, Any]) -> list[str]:
    hints: list[str] = []
    parse_failures = metric.get("parse_failure_counts") or {}
    fallback_classes = metric.get("fallback_class_counts") or {}
    recovery_classes = metric.get("recovery_strategy_counts") or {}
    compliance_rejections = int(metric.get("compliance_rejections") or 0)

    fetch_failure_total = sum(
        count for key, count in (parse_failures or {}).items() if str(key).startswith("fetch_failed:")
    )
    if fetch_failure_total > 0:
        hints.append(
            "Fetch failures detected (see `fetch_failed:*`). Check domain reachability, timeouts, and rate limiting before tuning selectors."
        )

    if parse_failures.get("domain-selector-mismatch", 0) > 0 or fallback_classes.get("domain-selector-mismatch", 0) > 0:
        hints.append("Update `parser_settings.ingredient_selectors` and `parser_settings.instruction_selectors` for this domain.")
    if parse_failures.get("instruction-structure-mismatch", 0) > 0:
        hints.append("Set `parser_settings.instruction_heading_keywords` to match this source's section headings.")
    if parse_failures.get("domain-instructions-sparse", 0) > 0:
        hints.append("Enable heading fallback and add instruction selectors for nested method blocks.")
    if parse_failures.get("low-confidence-parse", 0) > 0:
        hints.append("Tune `min_extraction_confidence` or improve selectors to reduce low-confidence parses.")
    if parse_failures.get("missing-recipe-markers", 0) > 0:
        hints.append("Adjust `required_text_markers` for this domain if valid recipe pages are being rejected.")
    if parse_failures.get("jsonld-parse-failed", 0) > 0 or parse_failures.get("jsonld-incomplete", 0) > 0:
        hints.append("Disable JSON-LD for this domain (`parser_settings.enable_jsonld=false`) and rely on domain selectors.")
    if parse_failures.get("microdata-parse-failed", 0) > 0:
        hints.append("Disable microdata parsing for this domain (`parser_settings.enable_microdata=false`) and tune DOM selectors.")
    if recovery_classes:
        hints.append("Recovery parser is active for this domain; review `recovery:*` strategies and promote stable selectors into parser settings.")
    if compliance_rejections > 0:
        hints.append("Review compliance reasons and confirm robots/canonical/paywall settings before increasing crawl volume.")

    if not hints and (metric.get("failure_rate") or 0) > 0.2:
        hints.append("High failure rate with weak class signal: inspect latest failures and add domain-specific parser settings.")
    return hints[:5]


@router.get("/users", response_model=List[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(current_active_admin),
):
    result = await db.execute(select(User).order_by(User.email))
    return list(result.scalars().all())


@router.patch("/users/{user_id}", response_model=UserRead)
async def update_user(
    user_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(current_active_admin),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if "role" in payload:
        user.role = payload["role"]
    if "is_active" in payload:
        user.is_active = bool(payload["is_active"])
    if "is_verified" in payload:
        user.is_verified = bool(payload["is_verified"])
    if "mfa_enabled" in payload:
        user.mfa_enabled = bool(payload["mfa_enabled"])
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/source-policies", response_model=List[RecipeSourcePolicyRead])
async def list_source_policies(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(current_active_admin),
):
    result = await db.execute(select(RecipeSourcePolicy).order_by(RecipeSourcePolicy.name))
    return list(result.scalars().all())


@router.post("/source-policies", response_model=RecipeSourcePolicyRead)
async def create_source_policy(
    payload: RecipeSourcePolicyCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(current_active_admin),
):
    policy = RecipeSourcePolicy(**payload.model_dump())
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return policy


@router.patch("/source-policies/{policy_id}", response_model=RecipeSourcePolicyRead)
async def update_source_policy(
    policy_id: str,
    payload: RecipeSourcePolicyUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(current_active_admin),
):
    policy = await db.get(RecipeSourcePolicy, policy_id)
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source policy not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(policy, field, value)
    await db.commit()
    await db.refresh(policy)
    return policy


@router.delete("/source-policies/{policy_id}")
async def delete_source_policy(
    policy_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(current_active_admin),
):
    policy = await db.get(RecipeSourcePolicy, policy_id)
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source policy not found")
    await db.delete(policy)
    await db.commit()
    return {"status": "deleted"}


@router.post(
    "/source-policies/{policy_id}/parser-settings/suggest-recovery",
    response_model=ParserRecoverySuggestionResponse,
)
async def suggest_recovery_parser_settings(
    policy_id: str,
    payload: ParserRecoverySuggestionRequest,
    apply: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
    user: Optional[User] = Depends(optional_user),
):
    if internal_token != settings.internal_token and (not user or user.role != "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    policy = await db.get(RecipeSourcePolicy, policy_id)
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source policy not found")

    parse_failure = _normalize_parse_failure(payload.parse_failure)
    if not parse_failure or parse_failure not in RECOVERY_SUPPORTED_FAILURES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported parse failure class: {payload.parse_failure}",
        )

    source_url = payload.source_url or f"https://{policy.domain}/"
    parsed = urlparse(source_url)
    if not parsed.hostname or not _hostname_matches_policy(parsed.hostname, policy.domain):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="source_url hostname must match policy domain",
        )

    current_settings = dict(policy.parser_settings) if isinstance(policy.parser_settings, dict) else {}
    suggested_settings, actions = build_recovery_parser_settings(
        parse_failure=parse_failure,
        source_url=source_url,
        parser_settings=current_settings,
    )

    patch: dict[str, Any] = {}
    for key, value in suggested_settings.items():
        if key not in current_settings or current_settings.get(key) != value:
            patch[key] = value
    changed_keys = sorted(patch.keys())

    applied = False
    if apply and actions and patch:
        next_settings = dict(current_settings)
        next_settings.update(patch)
        policy.parser_settings = next_settings
        await db.commit()
        applied = True

    return ParserRecoverySuggestionResponse(
        policy_id=policy.id,
        domain=policy.domain,
        parse_failure=parse_failure,
        source_url=source_url,
        actions=actions,
        changed_keys=changed_keys,
        patch=patch,
        applied=applied,
    )


@router.get("/system-jobs", response_model=List[SystemJobRead])
async def list_system_jobs(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(current_active_admin),
):
    result = await db.execute(select(SystemJob).order_by(SystemJob.name))
    return list(result.scalars().all())


@router.post("/system-jobs/{job_name}", response_model=SystemJobRead)
async def upsert_system_job(
    job_name: str,
    payload: SystemJobUpdate,
    db: AsyncSession = Depends(get_db),
    internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
    user: Optional[User] = Depends(optional_user),
):
    if internal_token != settings.internal_token and (not user or user.role != "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    result = await db.execute(select(SystemJob).where(SystemJob.name == job_name))
    job = result.scalars().first()
    if not job:
        job = SystemJob(name=job_name)
        db.add(job)
        await db.flush()
    job.last_run_at = datetime.utcnow()
    job.last_status = payload.status
    job.last_message = payload.message
    await db.commit()
    await db.refresh(job)
    return job


@router.get("/crawler-ops/telemetry")
async def crawler_ops_telemetry(
    db: AsyncSession = Depends(get_db),
    internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
    user: Optional[User] = Depends(optional_user),
):
    if internal_token != settings.internal_token and (not user or user.role != "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    policy_result = await db.execute(select(RecipeSourcePolicy))
    policies = list(policy_result.scalars().all())
    policy_by_domain = {policy.domain: policy for policy in policies}

    jobs_result = await db.execute(
        select(RecipeHarvestJob).order_by(RecipeHarvestJob.created_at.desc()).limit(2000)
    )
    jobs = list(jobs_result.scalars().all())

    domain_metrics: dict[str, dict[str, Any]] = {}
    retryable = 0
    failed_jobs = 0
    global_fallback_class_totals: dict[str, int] = {}
    global_parse_failure_totals: dict[str, int] = {}

    for job in jobs:
        domain = _domain_from_url(job.source_url)
        if not domain:
            continue
        metric = domain_metrics.setdefault(
            domain,
            {
                "domain": domain,
                "total_jobs": 0,
                "pending": 0,
                "running": 0,
                "succeeded": 0,
                "failed": 0,
                "retryable": 0,
                "compliance_rejections": 0,
                "avg_attempt_count": 0.0,
                "max_attempt_count": 0,
                "avg_retry_delay_seconds": 0.0,
                "parser_strategies": {},
                "fallback_class_counts": {},
                "recovery_strategy_counts": {},
                "parse_failure_counts": {},
                "failure_reason_counts": {},
                "latest_failures": [],
                "parser_fallback_rate": 0.0,
                "parse_failure_rate": 0.0,
            },
        )
        metric["total_jobs"] += 1
        status_name = (job.status or "unknown").lower()
        if status_name in {"pending", "running", "succeeded", "failed"}:
            metric[status_name] += 1
        if status_name == "failed":
            failed_jobs += 1
        attempts = int(job.attempt_count or 0)
        metric["avg_attempt_count"] += attempts
        metric["max_attempt_count"] = max(metric["max_attempt_count"], attempts)
        if status_name == "failed" and attempts < settings.harvest_max_attempts:
            retryable += 1
            metric["retryable"] += 1
        if job.last_attempt_at and job.next_retry_at:
            delta = (job.next_retry_at - job.last_attempt_at).total_seconds()
            if delta > 0:
                metric["avg_retry_delay_seconds"] += delta
        if job.compliance_reasons:
            metric["compliance_rejections"] += 1
            for reason in job.compliance_reasons:
                reason_key = f"compliance:{reason}"
                failure_reasons: dict[str, int] = metric["failure_reason_counts"]
                failure_reasons[reason_key] = failure_reasons.get(reason_key, 0) + 1
                parse_totals = metric["parse_failure_counts"]
                parse_totals[reason_key] = parse_totals.get(reason_key, 0) + 1
                global_parse_failure_totals[reason_key] = global_parse_failure_totals.get(reason_key, 0) + 1
        strategy = (job.parse_strategy or "unknown").strip() or "unknown"
        strategy_counts: dict[str, int] = metric["parser_strategies"]
        strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
        if strategy.startswith("dom_fallback"):
            fallback_class = strategy.split(":", 1)[1] if ":" in strategy else "unclassified"
            if "@" in fallback_class:
                fallback_class = fallback_class.split("@", 1)[0]
            fallback_counts: dict[str, int] = metric["fallback_class_counts"]
            fallback_counts[fallback_class] = fallback_counts.get(fallback_class, 0) + 1
            global_fallback_class_totals[fallback_class] = global_fallback_class_totals.get(fallback_class, 0) + 1
        if strategy.startswith("parse_failed:"):
            parse_class = strategy.split(":", 1)[1] if ":" in strategy else "unknown-parse-failure"
            if "@" in parse_class:
                parse_class = parse_class.split("@", 1)[0]
            parse_counts: dict[str, int] = metric["parse_failure_counts"]
            parse_counts[parse_class] = parse_counts.get(parse_class, 0) + 1
            global_parse_failure_totals[parse_class] = global_parse_failure_totals.get(parse_class, 0) + 1
        if strategy.startswith("fetch_failed:"):
            fetch_class = strategy.split(":", 1)[1] if ":" in strategy else "unknown-fetch-failure"
            if "@" in fetch_class:
                fetch_class = fetch_class.split("@", 1)[0]
            parse_key = f"fetch_failed:{fetch_class}"
            parse_counts = metric["parse_failure_counts"]
            parse_counts[parse_key] = parse_counts.get(parse_key, 0) + 1
            global_parse_failure_totals[parse_key] = global_parse_failure_totals.get(parse_key, 0) + 1
        if strategy.startswith("recovery:"):
            recovery_descriptor = strategy.split(":", 1)[1] if ":" in strategy else "unknown"
            recovery_class = recovery_descriptor.split(":", 1)[0].strip() if ":" in recovery_descriptor else recovery_descriptor
            if "@" in recovery_class:
                recovery_class = recovery_class.split("@", 1)[0]
            if not recovery_class:
                recovery_class = "unknown"
            recovery_counts: dict[str, int] = metric["recovery_strategy_counts"]
            recovery_counts[recovery_class] = recovery_counts.get(recovery_class, 0) + 1
        if status_name == "failed":
            if isinstance(job.error, str) and job.error:
                failure_key = f"error:{job.error.split(':', 1)[0].strip()[:120]}"
                failure_reasons = metric["failure_reason_counts"]
                failure_reasons[failure_key] = failure_reasons.get(failure_key, 0) + 1
                match = PARSE_FAILURE_PATTERN.search(job.error)
                if match:
                    parse_class = match.group("class")
                    parse_counts = metric["parse_failure_counts"]
                    parse_counts[parse_class] = parse_counts.get(parse_class, 0) + 1
                    global_parse_failure_totals[parse_class] = global_parse_failure_totals.get(parse_class, 0) + 1
                fetch_match = FETCH_FAILURE_PATTERN.search(job.error)
                if fetch_match:
                    fetch_class = f"fetch_failed:{fetch_match.group('class')}"
                    parse_counts = metric["parse_failure_counts"]
                    parse_counts[fetch_class] = parse_counts.get(fetch_class, 0) + 1
                    global_parse_failure_totals[fetch_class] = global_parse_failure_totals.get(fetch_class, 0) + 1
            latest_failures: list[dict[str, Any]] = metric["latest_failures"]
            if len(latest_failures) < 8:
                latest_failures.append(
                    {
                        "job_id": str(job.id),
                        "source_url": job.source_url,
                        "attempt_count": attempts,
                        "next_retry_at": job.next_retry_at.isoformat() if job.next_retry_at else None,
                        "error": str(job.error) if job.error is not None else None,
                        "compliance_reasons": job.compliance_reasons or [],
                    }
                )

    alerts: list[dict[str, Any]] = []
    formatted_domains: list[dict[str, Any]] = []
    for domain, metric in sorted(domain_metrics.items(), key=lambda item: item[0]):
        total = metric["total_jobs"] or 1
        failed = metric["failed"]
        failure_rate = failed / total
        metric["failure_rate"] = round(failure_rate, 4)
        metric["avg_attempt_count"] = round(metric["avg_attempt_count"] / total, 3)
        delay_divisor = max(metric["failed"], 1)
        metric["avg_retry_delay_seconds"] = round(metric["avg_retry_delay_seconds"] / delay_divisor, 3)
        fallback_total = sum(metric["fallback_class_counts"].values())
        metric["parser_fallback_rate"] = round(fallback_total / total, 4)
        parse_failure_total = sum(metric["parse_failure_counts"].values())
        metric["parse_failure_rate"] = round(parse_failure_total / total, 4)
        metric["top_failure_reasons"] = sorted(
            metric["failure_reason_counts"].items(),
            key=lambda item: item[1],
            reverse=True,
        )[:8]
        metric["top_parse_failure_classes"] = sorted(
            metric["parse_failure_counts"].items(),
            key=lambda item: item[1],
            reverse=True,
        )[:8]
        metric["triage_hints"] = _domain_triage_hints(metric)

        policy = policy_by_domain.get(domain)
        threshold_settings = policy.alert_settings if policy and policy.alert_settings else {}
        failure_threshold = _setting_as_float(threshold_settings, "max_failure_rate", 0.35)
        retry_threshold = _setting_as_int(threshold_settings, "max_retry_queue", 10)
        compliance_threshold = _setting_as_int(threshold_settings, "max_compliance_rejections", 5)
        fallback_threshold = _setting_as_float(threshold_settings, "max_parser_fallback_rate", 0.6)
        parse_failure_threshold = _setting_as_float(threshold_settings, "max_parse_failure_rate", 0.3)
        avg_attempt_threshold = _setting_as_float(threshold_settings, "max_avg_attempt_count", 2.0)

        threshold_map = {
            "max_failure_rate": failure_threshold,
            "max_retry_queue": retry_threshold,
            "max_compliance_rejections": compliance_threshold,
            "max_parser_fallback_rate": fallback_threshold,
            "max_parse_failure_rate": parse_failure_threshold,
            "max_avg_attempt_count": avg_attempt_threshold,
        }
        metric["alert_thresholds"] = threshold_map
        update_domain_telemetry_gauges(
            domain=domain,
            failure_rate=metric["failure_rate"],
            retryable_jobs=metric["retryable"],
            parser_fallback_rate=metric["parser_fallback_rate"],
            avg_attempt_count=metric["avg_attempt_count"],
            compliance_rejections=metric["compliance_rejections"],
        )

        if metric["failure_rate"] > failure_threshold:
            alerts.append(
                {
                    "domain": domain,
                    "severity": "critical",
                    "metric": "failure_rate",
                    "actual": metric["failure_rate"],
                    "threshold": failure_threshold,
                    "message": "Harvest failures exceed configured threshold.",
                }
            )
        if metric["retryable"] > retry_threshold:
            alerts.append(
                {
                    "domain": domain,
                    "severity": "warning",
                    "metric": "retryable",
                    "actual": metric["retryable"],
                    "threshold": retry_threshold,
                    "message": "Retry queue size exceeds configured threshold.",
                }
            )
        if metric["compliance_rejections"] > compliance_threshold:
            alerts.append(
                {
                    "domain": domain,
                    "severity": "warning",
                    "metric": "compliance_rejections",
                    "actual": metric["compliance_rejections"],
                    "threshold": compliance_threshold,
                    "message": "Compliance rejections exceed configured threshold.",
                }
            )
        if metric["parser_fallback_rate"] > fallback_threshold:
            alerts.append(
                {
                    "domain": domain,
                    "severity": "warning",
                    "metric": "parser_fallback_rate",
                    "actual": metric["parser_fallback_rate"],
                    "threshold": fallback_threshold,
                    "message": "Fallback parser usage exceeds configured threshold.",
                }
            )
        if metric["parse_failure_rate"] > parse_failure_threshold:
            alerts.append(
                {
                    "domain": domain,
                    "severity": "warning",
                    "metric": "parse_failure_rate",
                    "actual": metric["parse_failure_rate"],
                    "threshold": parse_failure_threshold,
                    "message": "Parse failures exceed configured threshold.",
                }
            )
        if metric["avg_attempt_count"] > avg_attempt_threshold:
            alerts.append(
                {
                    "domain": domain,
                    "severity": "warning",
                    "metric": "avg_attempt_count",
                    "actual": metric["avg_attempt_count"],
                    "threshold": avg_attempt_threshold,
                    "message": "Average attempt count exceeds configured threshold.",
                }
            )

        formatted_domains.append(metric)

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "global": {
            "total_jobs": len(jobs),
            "failed_jobs": failed_jobs,
            "retryable_jobs": retryable,
            "max_attempts": settings.harvest_max_attempts,
            "fallback_class_totals": global_fallback_class_totals,
            "parse_failure_totals": global_parse_failure_totals,
        },
        "domains": formatted_domains,
        "alerts": alerts,
    }


@router.post("/source-policies/calibrate-alerts")
async def calibrate_source_policy_alerts(
    apply: bool = Query(default=False),
    min_jobs: int = Query(default=20, ge=1, le=5000),
    buffer_multiplier: float = Query(default=1.25, ge=1.0, le=3.0),
    db: AsyncSession = Depends(get_db),
    internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
    user: Optional[User] = Depends(optional_user),
):
    if internal_token != settings.internal_token and (not user or user.role != "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # NOTE: `crawler_ops_telemetry` is protected by the same auth primitive (internal token OR admin user).
    # When calibrating via internal token, we intentionally do not require an admin user to exist yet.
    telemetry = await crawler_ops_telemetry(db=db, internal_token=internal_token, user=user)
    domains = telemetry.get("domains", [])
    metric_by_domain = {
        str(metric.get("domain")): metric
        for metric in domains
        if isinstance(metric, dict) and metric.get("domain")
    }
    policy_result = await db.execute(select(RecipeSourcePolicy))
    policies = sorted(list(policy_result.scalars().all()), key=lambda policy: policy.domain)

    recommendations: list[dict[str, Any]] = []
    updated_domains: list[str] = []

    for policy in policies:
        domain = policy.domain
        metric = metric_by_domain.get(domain)
        if not metric:
            recommendations.append(
                {
                    "domain": domain,
                    "status": "skipped",
                    "reason": "no_telemetry",
                    "min_jobs_required": min_jobs,
                }
            )
            continue
        total_jobs = int(metric.get("total_jobs") or 0)
        if total_jobs < min_jobs:
            recommendations.append(
                {
                    "domain": domain,
                    "status": "skipped",
                    "reason": f"insufficient_jobs:{total_jobs}",
                    "min_jobs_required": min_jobs,
                }
            )
            continue

        failure_rate = float(metric.get("failure_rate") or 0.0)
        retryable = int(metric.get("retryable") or 0)
        compliance_rejections = int(metric.get("compliance_rejections") or 0)
        parser_fallback_rate = float(metric.get("parser_fallback_rate") or 0.0)
        parse_failure_rate = float(metric.get("parse_failure_rate") or 0.0)
        avg_attempt_count = float(metric.get("avg_attempt_count") or 0.0)

        recommended_alert_settings = {
            "max_failure_rate": round(min(max((failure_rate * buffer_multiplier) + 0.02, 0.08), 0.85), 4),
            "max_retry_queue": max(int(round((retryable * buffer_multiplier) + 1)), 3),
            "max_compliance_rejections": max(
                int(round((compliance_rejections * buffer_multiplier) + 1)),
                1,
            ),
            "max_parser_fallback_rate": round(
                min(max((parser_fallback_rate * buffer_multiplier) + 0.05, 0.25), 0.95),
                4,
            ),
            "max_parse_failure_rate": round(
                min(max((parse_failure_rate * buffer_multiplier) + 0.04, 0.15), 0.9),
                4,
            ),
            "max_avg_attempt_count": round(
                min(max((avg_attempt_count * buffer_multiplier) + 0.2, 1.2), 5.0),
                3,
            ),
            "calibrated_from_jobs": total_jobs,
            "calibrated_at": datetime.utcnow().isoformat(),
            "calibration_buffer_multiplier": buffer_multiplier,
        }

        if apply:
            existing_alert_settings = (
                dict(policy.alert_settings) if isinstance(policy.alert_settings, dict) else {}
            )
            existing_alert_settings.update(recommended_alert_settings)
            policy.alert_settings = existing_alert_settings
            updated_domains.append(domain)

        recommendations.append(
            {
                "domain": domain,
                "status": "calibrated" if apply else "recommended",
                "total_jobs": total_jobs,
                "observed": {
                    "failure_rate": failure_rate,
                    "retryable_jobs": retryable,
                    "compliance_rejections": compliance_rejections,
                    "parser_fallback_rate": parser_fallback_rate,
                    "parse_failure_rate": parse_failure_rate,
                    "avg_attempt_count": avg_attempt_count,
                },
                "recommended_alert_settings": recommended_alert_settings,
            }
        )

    if apply and updated_domains:
        await db.commit()

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "apply": apply,
        "min_jobs": min_jobs,
        "buffer_multiplier": buffer_multiplier,
        "updated_domains": updated_domains,
        "recommendations": recommendations,
    }
