#!/usr/bin/env python3
"""
Staging smoke: verify the rejection path is active for a known non-recipe URL.

This script is stdlib-only and uses internal-token endpoints:
- POST /v1/recipes/harvest/auto
- GET  /v1/recipes/harvest/jobs/{job_id}
- POST /v1/recipes/harvest/jobs/{job_id}/run
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Optional


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


def main() -> int:
    api_base_url = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
    token = os.getenv("INTERNAL_TOKEN", "").strip()
    source_url = os.getenv("COMPLIANCE_TEST_URL", "https://www.allrecipes.com/privacy-policy").strip()
    max_links = int(os.getenv("COMPLIANCE_TEST_MAX_LINKS", "8"))
    poll_tries = int(os.getenv("POLL_TRIES", "6"))
    poll_sleep_seconds = float(os.getenv("POLL_SLEEP_SECONDS", "1.5"))

    if not token:
        print("INTERNAL_TOKEN is required", file=sys.stderr)
        return 2

    auto = _request_json(
        "POST",
        f"{api_base_url}/v1/recipes/harvest/auto",
        token=token,
        body={
            "source_url": source_url,
            "source_type": "web",
            "max_links": max_links,
            "enqueue": True,
        },
    )
    if auto.status >= 400:
        print(f"Auto harvest failed: HTTP {auto.status} {auto.payload}", file=sys.stderr)
        return 1

    queued = auto.payload.get("queued_job_ids") if isinstance(auto.payload, dict) else None
    if not isinstance(queued, list) or not queued:
        parse_failures = {}
        if isinstance(auto.payload, dict):
            raw = auto.payload.get("parse_failure_counts")
            if isinstance(raw, dict):
                parse_failures = raw
        if parse_failures:
            print(
                json.dumps(
                    {
                        "status": "accepted_nonqueued_rejection",
                        "reason": "auto-harvest rejected before queue",
                        "parse_failure_counts": parse_failures,
                        "source_url": source_url,
                    },
                    indent=2,
                )
            )
            return 0
        print(f"No queued jobs found in response: {auto.payload}", file=sys.stderr)
        return 1
    job_id = str(queued[0])
    print(f"Queued compliance smoke job: {job_id}")

    run = _request_json(
        "POST",
        f"{api_base_url}/v1/recipes/harvest/jobs/{job_id}/run",
        token=token,
        body={},
    )
    if run.status >= 400:
        print(f"Run job returned HTTP {run.status}; continuing to inspect final job payload.")

    job_payload: dict[str, Any] | None = None
    for _ in range(max(poll_tries, 1)):
        detail = _request_json(
            "GET",
            f"{api_base_url}/v1/recipes/harvest/jobs/{job_id}",
            token=token,
            body=None,
        )
        if detail.status >= 400:
            print(f"Job detail failed: HTTP {detail.status} {detail.payload}", file=sys.stderr)
            return 1
        if isinstance(detail.payload, dict):
            job_payload = detail.payload
            status = str(detail.payload.get("status") or "").lower()
            if status in {"failed", "succeeded"}:
                break
        time.sleep(poll_sleep_seconds)

    if not job_payload:
        print("No job payload returned from detail endpoint.", file=sys.stderr)
        return 1

    compliance_reasons = job_payload.get("compliance_reasons")
    error_message = str(job_payload.get("error") or "")
    parse_strategy = str(job_payload.get("parse_strategy") or "")

    if isinstance(compliance_reasons, list) and compliance_reasons:
        print("Compliance rejection verified.")
        print(json.dumps(
            {
                "job_id": job_id,
                "status": job_payload.get("status"),
                "classification": "compliance-rejection",
                "parse_strategy": parse_strategy,
                "compliance_reasons": compliance_reasons,
                "error": error_message,
            },
            indent=2,
        ))
        return 0

    lowered_strategy = parse_strategy.lower()
    lowered_error = error_message.lower()
    if lowered_strategy.startswith("parse_failed:") or "parse failed" in lowered_error or "fetch_failed" in lowered_error:
        print("Non-recipe rejection verified via parse/fetch failure class.")
        print(json.dumps(
            {
                "job_id": job_id,
                "status": job_payload.get("status"),
                "classification": "parse-or-fetch-rejection",
                "parse_strategy": parse_strategy,
                "compliance_reasons": compliance_reasons,
                "error": error_message,
            },
            indent=2,
        ))
        return 0

    print("Rejection path was not observed. Inspect payload:", file=sys.stderr)
    print(json.dumps(job_payload, indent=2), file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
