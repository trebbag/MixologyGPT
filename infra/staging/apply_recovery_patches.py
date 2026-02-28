#!/usr/bin/env python3
"""
Staging ops helper: use real crawler telemetry failure classes to generate recovery parser-settings
patches per domain, then (optionally) apply SAFE patches back to Source Policies.

Safety rules:
- This tool never auto-applies patches that touch compliance-oriented keys (e.g. required_text_markers).
- Only keys in SAFE_PATCH_KEYS are eligible for auto-apply.

API dependencies (X-Internal-Token):
- GET  /v1/admin/crawler-ops/telemetry
- GET  /v1/recipes/harvest/policies
- POST /v1/admin/source-policies/{policy_id}/parser-settings/suggest-recovery?apply=...
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional


SUPPORTED_FAILURES = {
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

# Only these keys may be auto-applied. Anything else is emitted as evidence and skipped.
SAFE_PATCH_KEYS = {
    "ingredient_selectors",
    "instruction_selectors",
    "instruction_heading_keywords",
    "enable_jsonld",
    "enable_microdata",
    "enable_domain_dom",
    "enable_dom_fallback",
    "enable_recovery",
    "min_extraction_confidence",
    "penalize_missing_engagement_signals",
    "allow_low_confidence",
}

# Keys that should never be auto-applied without explicit policy review.
BLOCKED_PATCH_KEYS = {
    "required_text_markers",
    "blocked_title_keywords",
    "recipe_path_hints",
    "blocked_path_hints",
    "respect_robots",
}


@dataclass
class HttpResult:
    status: int
    payload: Any


def _request_json(
    method: str,
    url: str,
    token: str,
    body: Optional[dict[str, Any]] = None,
    timeout: float = 60.0,
) -> HttpResult:
    headers = {
        "Accept": "application/json",
        "X-Internal-Token": token,
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read().decode("utf-8") if res.readable() else ""
            payload = json.loads(raw) if raw else None
            return HttpResult(status=res.status, payload=payload)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8") if exc.fp else ""
        try:
            payload = json.loads(raw) if raw else {"detail": raw}
        except json.JSONDecodeError:
            payload = {"detail": raw or str(exc)}
        return HttpResult(status=exc.code, payload=payload)


def _telemetry(api_base_url: str, token: str) -> dict[str, Any]:
    url = f"{api_base_url}/v1/admin/crawler-ops/telemetry"
    res = _request_json("GET", url, token=token, body=None, timeout=60.0)
    if res.status >= 400:
        raise RuntimeError(f"Telemetry fetch failed: HTTP {res.status} {res.payload}")
    if not isinstance(res.payload, dict):
        return {}
    return dict(res.payload)


def _policy_list(api_base_url: str, token: str) -> list[dict[str, Any]]:
    url = f"{api_base_url}/v1/recipes/harvest/policies?limit=200"
    res = _request_json("GET", url, token=token, body=None, timeout=30.0)
    if res.status >= 400:
        raise RuntimeError(f"Harvest policies fetch failed: HTTP {res.status} {res.payload}")
    if not isinstance(res.payload, list):
        return []
    return list(res.payload)


def _combine_failure_counts(metric: dict[str, Any]) -> dict[str, int]:
    combined: dict[str, int] = {}
    for bucket_key in ("parse_failure_counts", "fallback_class_counts", "recovery_strategy_counts"):
        bucket = metric.get(bucket_key) or {}
        if not isinstance(bucket, dict):
            continue
        for key, raw in bucket.items():
            failure = str(key or "").strip()
            if failure.startswith("compliance:") or failure.startswith("error:"):
                continue
            if failure.startswith("fetch_failed:"):
                continue
            if failure not in SUPPORTED_FAILURES:
                continue
            try:
                count = int(raw or 0)
            except (TypeError, ValueError):
                count = 0
            if count <= 0:
                continue
            combined[failure] = combined.get(failure, 0) + count
    return combined


def _suggest_patch(
    api_base_url: str,
    token: str,
    policy_id: str,
    domain: str,
    parse_failure: str,
    apply: bool,
) -> dict[str, Any]:
    query = urllib.parse.urlencode({"apply": "true" if apply else "false"})
    url = f"{api_base_url}/v1/admin/source-policies/{policy_id}/parser-settings/suggest-recovery?{query}"
    body = {"parse_failure": parse_failure, "source_url": f"https://{domain}/"}
    res = _request_json("POST", url, token=token, body=body, timeout=60.0)
    if res.status >= 400:
        return {"status": "error", "http_status": res.status, "payload": res.payload}
    if not isinstance(res.payload, dict):
        return {"status": "error", "http_status": res.status, "payload": res.payload}
    return dict(res.payload)


def main() -> int:
    api_base_url = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
    token = os.getenv("INTERNAL_TOKEN", "").strip()
    if not token:
        print("INTERNAL_TOKEN is required", file=sys.stderr)
        return 2

    apply = os.getenv("APPLY", "false").strip().lower() in {"1", "true", "yes", "y", "on"}
    min_count = int(os.getenv("MIN_CLASS_COUNT", "1"))
    max_classes_per_domain = int(os.getenv("MAX_CLASSES_PER_DOMAIN", "3"))

    target_domains_env = os.getenv("TARGET_DOMAINS", "").strip()
    target_domains = None
    if target_domains_env:
        target_domains = {part.strip().lower() for part in target_domains_env.split(",") if part.strip()}

    run_id = os.getenv("RUN_ID", datetime.utcnow().strftime("%Y-%m-%d_%H%M%S"))
    evidence_dir = os.getenv(
        "EVIDENCE_DIR",
        os.path.join(os.path.dirname(__file__), "..", "..", "docs", "runbooks", "evidence"),
    )
    os.makedirs(evidence_dir, exist_ok=True)
    evidence_path = os.path.join(evidence_dir, f"staging-recovery-patches-{run_id}.json")

    policies = _policy_list(api_base_url, token)
    policy_by_domain = {
        str(policy.get("domain") or "").strip().lower(): policy for policy in policies if policy.get("domain")
    }

    telemetry = _telemetry(api_base_url, token)
    domains = telemetry.get("domains") or []
    if not isinstance(domains, list):
        domains = []

    evidence: dict[str, Any] = {
        "run_id": run_id,
        "api_base_url": api_base_url,
        "apply": apply,
        "min_class_count": min_count,
        "max_classes_per_domain": max_classes_per_domain,
        "started_at": datetime.utcnow().isoformat(),
        "domains": [],
        "skipped": [],
    }

    for metric in domains:
        if not isinstance(metric, dict):
            continue
        domain = str(metric.get("domain") or "").strip().lower()
        if not domain:
            continue
        if target_domains is not None and domain not in target_domains:
            continue
        policy = policy_by_domain.get(domain)
        if not policy:
            evidence["skipped"].append({"domain": domain, "reason": "no_policy"})
            continue
        policy_id = str(policy.get("id") or "").strip()
        if not policy_id:
            evidence["skipped"].append({"domain": domain, "reason": "missing_policy_id"})
            continue

        combined = _combine_failure_counts(metric)
        candidates = [
            (failure, count)
            for failure, count in sorted(combined.items(), key=lambda item: item[1], reverse=True)
            if count >= min_count
        ][:max_classes_per_domain]
        if not candidates:
            evidence["skipped"].append({"domain": domain, "reason": "no_supported_failure_classes"})
            continue

        domain_log: dict[str, Any] = {
            "domain": domain,
            "policy_id": policy_id,
            "candidates": [{"parse_failure": f, "count": c} for f, c in candidates],
            "suggestions": [],
        }

        for failure, _count in candidates:
            preview = _suggest_patch(
                api_base_url=api_base_url,
                token=token,
                policy_id=policy_id,
                domain=domain,
                parse_failure=failure,
                apply=False,
            )
            suggestion_log: dict[str, Any] = {
                "parse_failure": failure,
                "preview": preview,
                "apply": {"status": "skipped"},
            }

            patch = preview.get("patch") if isinstance(preview, dict) else None
            changed_keys = preview.get("changed_keys") if isinstance(preview, dict) else None
            patch_keys = []
            if isinstance(changed_keys, list):
                patch_keys = [str(k) for k in changed_keys if k]
            elif isinstance(patch, dict):
                patch_keys = [str(k) for k in patch.keys()]

            blocked = sorted({k for k in patch_keys if k in BLOCKED_PATCH_KEYS})
            unknown = sorted({k for k in patch_keys if k not in SAFE_PATCH_KEYS and k not in BLOCKED_PATCH_KEYS})
            safe_only = bool(patch_keys) and not blocked and not unknown and all(k in SAFE_PATCH_KEYS for k in patch_keys)

            suggestion_log["patch_keys"] = patch_keys
            suggestion_log["blocked_keys"] = blocked
            suggestion_log["unknown_keys"] = unknown
            suggestion_log["safe_only"] = safe_only

            if apply and safe_only and isinstance(preview, dict) and preview.get("status") != "error":
                applied = _suggest_patch(
                    api_base_url=api_base_url,
                    token=token,
                    policy_id=policy_id,
                    domain=domain,
                    parse_failure=failure,
                    apply=True,
                )
                suggestion_log["apply"] = applied

            domain_log["suggestions"].append(suggestion_log)

        evidence["domains"].append(domain_log)

    evidence["finished_at"] = datetime.utcnow().isoformat()
    with open(evidence_path, "w", encoding="utf-8") as handle:
        json.dump(evidence, handle, indent=2, sort_keys=True)
    print(f"Evidence: {evidence_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

