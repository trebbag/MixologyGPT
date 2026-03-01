#!/usr/bin/env python3
"""
Ensure a source policy exists and is active on staging.

This script is intended for pilot ops usage where policy creation/activation must happen
through the admin API using an admin bearer token.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any


DEFAULT_POLICY_DOMAIN = "liquor.com"
DEFAULT_POLICY_NAME = "Liquor.com"
DEFAULT_POLICY_METRIC_TYPE = "pervasiveness"
DEFAULT_POLICY_REVIEW_POLICY = "manual"
DEFAULT_POLICY_SEEDS = [
    "https://www.liquor.com/cocktail-recipes-4779427",
    "https://www.liquor.com/classic-cocktail-recipes-4844600",
    "https://www.liquor.com/most-popular-cocktails-5020574",
]
DEFAULT_POLICY_PARSER_SETTINGS: dict[str, Any] = {
    "recipe_path_hints": ["/recipes/"],
    "blocked_path_hints": ["/best-", "/what-is-", "/how-to-", "/news/"],
    "required_text_markers": ["ingredients", "directions", "instructions", "method"],
}


def _request_json(
    method: str,
    url: str,
    bearer_token: str,
    body: dict[str, Any] | None = None,
    timeout: float = 60.0,
) -> tuple[int, Any]:
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {bearer_token}",
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read().decode("utf-8") if res.readable() else ""
            parsed = json.loads(raw) if raw else None
            return res.status, parsed
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8") if exc.fp else ""
        try:
            parsed = json.loads(raw) if raw else {"detail": raw}
        except json.JSONDecodeError:
            parsed = {"detail": raw or str(exc)}
        return exc.code, parsed


def _normalize_domain(value: str) -> str:
    return value.strip().lower()


def _split_csv(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def main() -> int:
    api_base_url = os.getenv("API_BASE_URL", "").strip().rstrip("/")
    bearer_token = (
        os.getenv("ADMIN_BEARER_TOKEN", "").strip()
        or os.getenv("STAGING_E2E_ACCESS_TOKEN", "").strip()
    )
    if not api_base_url:
        print("API_BASE_URL is required", file=sys.stderr)
        return 2
    if not bearer_token:
        print("ADMIN_BEARER_TOKEN (or STAGING_E2E_ACCESS_TOKEN) is required", file=sys.stderr)
        return 2

    policy_domain = _normalize_domain(os.getenv("POLICY_DOMAIN", DEFAULT_POLICY_DOMAIN))
    policy_name = os.getenv("POLICY_NAME", DEFAULT_POLICY_NAME).strip() or DEFAULT_POLICY_NAME
    metric_type = (
        os.getenv("POLICY_METRIC_TYPE", DEFAULT_POLICY_METRIC_TYPE).strip()
        or DEFAULT_POLICY_METRIC_TYPE
    )
    review_policy = (
        os.getenv("POLICY_REVIEW_POLICY", DEFAULT_POLICY_REVIEW_POLICY).strip()
        or DEFAULT_POLICY_REVIEW_POLICY
    )
    seed_urls = _split_csv(os.getenv("POLICY_SEED_URLS", ",".join(DEFAULT_POLICY_SEEDS)))
    run_id = os.getenv("RUN_ID", datetime.utcnow().strftime("%Y%m%d_%H%M%S"))
    evidence_dir = os.getenv(
        "EVIDENCE_DIR",
        os.path.join(os.path.dirname(__file__), "..", "..", "docs", "runbooks", "evidence"),
    )
    os.makedirs(evidence_dir, exist_ok=True)
    evidence_path = os.path.join(
        evidence_dir, f"ensure-source-policy-{policy_domain.replace('.', '_')}-{run_id}.json"
    )

    status, policies = _request_json(
        "GET", f"{api_base_url}/v1/admin/source-policies", bearer_token=bearer_token
    )
    if status >= 400 or not isinstance(policies, list):
        print(f"Failed to list source policies: HTTP {status} {policies}", file=sys.stderr)
        return 1

    existing = None
    for policy in policies:
        if _normalize_domain(str(policy.get("domain", ""))) == policy_domain:
            existing = policy
            break

    evidence: dict[str, Any] = {
        "run_id": run_id,
        "api_base_url": api_base_url,
        "policy_domain": policy_domain,
        "started_at": datetime.utcnow().isoformat(),
        "action": None,
        "created": None,
        "updated": None,
        "status": "unknown",
    }

    if existing is None:
        create_payload: dict[str, Any] = {
            "name": policy_name,
            "domain": policy_domain,
            "metric_type": metric_type,
            "min_rating_count": 0,
            "min_rating_value": 0.0,
            "review_policy": review_policy,
            "is_active": True,
            "seed_urls": seed_urls,
            "crawl_depth": 2,
            "max_pages": 40,
            "max_recipes": 20,
            "crawl_interval_minutes": 240,
            "respect_robots": True,
            "parser_settings": DEFAULT_POLICY_PARSER_SETTINGS,
            "alert_settings": {},
        }
        create_status, created = _request_json(
            "POST",
            f"{api_base_url}/v1/admin/source-policies",
            bearer_token=bearer_token,
            body=create_payload,
        )
        if create_status >= 400:
            evidence["action"] = "create"
            evidence["status"] = "error"
            evidence["created"] = {"http_status": create_status, "payload": created}
            with open(evidence_path, "w", encoding="utf-8") as handle:
                json.dump(evidence, handle, indent=2, sort_keys=True)
            print(f"Failed to create policy: HTTP {create_status} {created}", file=sys.stderr)
            return 1
        evidence["action"] = "create"
        evidence["created"] = created
        evidence["status"] = "ok"
    else:
        policy_id = str(existing.get("id", "")).strip()
        if not policy_id:
            print(f"Existing policy missing id for domain {policy_domain}", file=sys.stderr)
            return 1

        patch_payload: dict[str, Any] = {}
        if not bool(existing.get("is_active", False)):
            patch_payload["is_active"] = True

        current_seed_urls = [str(url).strip() for url in (existing.get("seed_urls") or []) if str(url).strip()]
        merged_seed_urls = list(dict.fromkeys(current_seed_urls + seed_urls))
        if merged_seed_urls != current_seed_urls:
            patch_payload["seed_urls"] = merged_seed_urls

        current_parser = existing.get("parser_settings") or {}
        if not isinstance(current_parser, dict) or not current_parser:
            patch_payload["parser_settings"] = DEFAULT_POLICY_PARSER_SETTINGS

        if patch_payload:
            patch_status, updated = _request_json(
                "PATCH",
                f"{api_base_url}/v1/admin/source-policies/{policy_id}",
                bearer_token=bearer_token,
                body=patch_payload,
            )
            if patch_status >= 400:
                evidence["action"] = "patch"
                evidence["status"] = "error"
                evidence["updated"] = {
                    "http_status": patch_status,
                    "payload": updated,
                    "patch_payload": patch_payload,
                }
                with open(evidence_path, "w", encoding="utf-8") as handle:
                    json.dump(evidence, handle, indent=2, sort_keys=True)
                print(f"Failed to patch policy: HTTP {patch_status} {updated}", file=sys.stderr)
                return 1
            evidence["action"] = "patch"
            evidence["updated"] = {
                "patch_payload": patch_payload,
                "result": updated,
            }
        else:
            evidence["action"] = "noop"
            evidence["updated"] = {"message": "policy already active with required defaults"}
        evidence["status"] = "ok"

    evidence["finished_at"] = datetime.utcnow().isoformat()
    with open(evidence_path, "w", encoding="utf-8") as handle:
        json.dump(evidence, handle, indent=2, sort_keys=True)

    print(f"Evidence: {evidence_path}")
    print(f"Status: {evidence['status']}")
    print(f"Action: {evidence['action']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
