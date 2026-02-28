#!/usr/bin/env python3
"""
Staging ops helper: drain pending harvest jobs by running them (internal token).

This is useful after queuing jobs via /v1/recipes/harvest/auto so telemetry reflects
real parse/compliance/failure classes rather than a backlog of pending jobs.

API dependencies (X-Internal-Token):
- GET  /v1/recipes/harvest/jobs/pending
- POST /v1/recipes/harvest/jobs/{job_id}/run
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
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


def _pending_jobs(api_base_url: str, token: str, limit: int) -> list[dict[str, Any]]:
    query = urllib.parse.urlencode({"limit": str(limit)})
    url = f"{api_base_url}/v1/recipes/harvest/jobs/pending?{query}"
    res = _request_json("GET", url, token=token, body=None, timeout=30.0)
    if res.status >= 400:
        raise RuntimeError(f"Pending jobs fetch failed: HTTP {res.status} {res.payload}")
    if not isinstance(res.payload, list):
        return []
    return list(res.payload)


def _run_job(api_base_url: str, token: str, job_id: str) -> dict[str, Any]:
    url = f"{api_base_url}/v1/recipes/harvest/jobs/{job_id}/run"
    res = _request_json("POST", url, token=token, body={}, timeout=90.0)
    if res.status >= 400:
        return {"status": "error", "http_status": res.status, "payload": res.payload}
    return res.payload or {}


def main() -> int:
    api_base_url = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
    token = os.getenv("INTERNAL_TOKEN", "").strip()
    if not token:
        print("INTERNAL_TOKEN is required", file=sys.stderr)
        return 2

    max_cycles = int(os.getenv("MAX_CYCLES", "25"))
    batch_limit = int(os.getenv("BATCH_LIMIT", "20"))
    sleep_seconds = float(os.getenv("SLEEP_SECONDS", "0.2"))

    run_id = os.getenv("RUN_ID", datetime.utcnow().strftime("%Y-%m-%d_%H%M%S"))
    evidence_dir = os.getenv(
        "EVIDENCE_DIR",
        os.path.join(os.path.dirname(__file__), "..", "..", "docs", "runbooks", "evidence"),
    )
    os.makedirs(evidence_dir, exist_ok=True)
    evidence_path = os.path.join(evidence_dir, f"staging-drain-pending-{run_id}.json")

    evidence: dict[str, Any] = {
        "run_id": run_id,
        "api_base_url": api_base_url,
        "max_cycles": max_cycles,
        "batch_limit": batch_limit,
        "started_at": datetime.utcnow().isoformat(),
        "cycles": [],
    }

    total_ran = 0
    for cycle in range(1, max_cycles + 1):
        pending = _pending_jobs(api_base_url, token, batch_limit)
        cycle_log: dict[str, Any] = {"cycle": cycle, "pending": len(pending), "jobs": []}
        if not pending:
            evidence["cycles"].append(cycle_log)
            break
        print(f"[cycle {cycle}] pending={len(pending)}")
        for job in pending:
            job_id = str(job.get("id") or "").strip()
            if not job_id:
                continue
            result = _run_job(api_base_url, token, job_id)
            total_ran += 1
            cycle_log["jobs"].append(
                {
                    "job_id": job_id,
                    "status": result.get("status"),
                    "parse_strategy": result.get("parse_strategy"),
                    "error": result.get("error"),
                    "compliance_reasons": result.get("compliance_reasons"),
                }
            )
        evidence["cycles"].append(cycle_log)
        time.sleep(max(sleep_seconds, 0.0))

    evidence["total_ran"] = total_ran
    evidence["finished_at"] = datetime.utcnow().isoformat()
    with open(evidence_path, "w", encoding="utf-8") as handle:
        json.dump(evidence, handle, indent=2, sort_keys=True)
    print(f"Evidence: {evidence_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

