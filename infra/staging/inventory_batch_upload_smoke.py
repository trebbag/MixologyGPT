#!/usr/bin/env python3
"""Smoke test the AI-assisted inventory batch upload and admin audit queue."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def _request(method: str, url: str, payload: dict | None = None, headers: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        if value:
            request.add_header(key, value)
    try:
        with urllib.request.urlopen(request) as response:
            body = response.read().decode("utf-8") or "{}"
            return response.status, json.loads(body)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8") or "{}"
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"detail": body}
        return exc.code, payload
    except urllib.error.URLError as exc:
        return 0, {"detail": str(exc.reason)}


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-base-url", default=os.environ.get("API_BASE_URL", "").strip())
    parser.add_argument("--access-token", default=os.environ.get("ACCESS_TOKEN", "").strip())
    parser.add_argument("--internal-token", default=os.environ.get("INTERNAL_TOKEN", "").strip())
    parser.add_argument("--prefix", default="Smoke Batch Upload")
    args = parser.parse_args()

    api_base_url = args.api_base_url.rstrip("/")
    access_token = args.access_token.strip()
    internal_token = args.internal_token.strip()

    _require(api_base_url, "Missing --api-base-url or API_BASE_URL")
    _require(access_token, "Missing --access-token or ACCESS_TOKEN")

    suffix = str(int(time.time()))
    payload = {
        "filename": f"inventory-smoke-{suffix}.txt",
        "content": f"{args.prefix} Bitter {suffix}\n{args.prefix} Citrus {suffix}",
    }
    auth_headers = {"Authorization": f"Bearer {access_token}"}

    preview_status, preview = _request(
        "POST",
        f"{api_base_url}/v1/inventory/batch-upload/preview",
        payload=payload,
        headers=auth_headers,
    )
    _require(preview_status == 200, f"Preview failed: HTTP {preview_status} {preview}")
    _require(preview.get("summary", {}).get("total_rows") == 2, f"Unexpected preview summary: {preview}")

    import_status, imported = _request(
        "POST",
        f"{api_base_url}/v1/inventory/batch-upload/import",
        payload=payload,
        headers=auth_headers,
    )
    _require(import_status == 200, f"Import failed: HTTP {import_status} {imported}")
    _require(imported.get("applied") is True, f"Import did not apply rows: {imported}")

    output = {
        "preview_rows": preview.get("summary", {}).get("total_rows"),
        "import_created_items": imported.get("summary", {}).get("created_items"),
        "import_pending_review_rows": imported.get("summary", {}).get("pending_review_rows"),
        "lookup_telemetry": imported.get("lookup_telemetry", {}),
    }

    if internal_token:
        audit_status, audits = _request(
            "GET",
            f"{api_base_url}/v1/admin/inventory-batch-audits?review_status=pending",
            headers={"X-Internal-Token": internal_token},
        )
        _require(audit_status == 200, f"Audit queue check failed: HTTP {audit_status} {audits}")
        row_names = {row.get("canonical_name") for row in audits.get("rows", [])}
        expected_names = {line.strip() for line in payload["content"].splitlines() if line.strip()}
        _require(expected_names.issubset(row_names), f"Pending audit rows missing expected names. expected={expected_names} actual={row_names}")
        output["audit_queue_rows"] = len(audits.get("rows", []))

    print(json.dumps(output, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
