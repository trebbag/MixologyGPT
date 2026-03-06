#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen


def require_html(status_code: int, headers: dict[str, str], body: str, label: str) -> None:
    content_type = (headers.get("content-type") or "").lower()
    body_head = (body or "")[:256].lower()
    if "text/html" in content_type or "<html" in body_head or "<!doctype html" in body_head:
        return
    raise RuntimeError(f"{label} did not return HTML (status={status_code}, content-type={content_type or 'unknown'})")


def request(method: str, url: str, headers: dict[str, str], timeout: float) -> tuple[int, dict[str, str], str]:
    req = Request(url, headers=headers, method=method)
    with urlopen(req, timeout=timeout) as response:
        return response.status, dict(response.headers.items()), response.read().decode("utf-8", errors="ignore")


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke-test staging API/web runtime surface and CORS.")
    parser.add_argument("--api-base-url", required=True)
    parser.add_argument("--web-base-url", required=True)
    parser.add_argument("--timeout", type=float, default=15.0)
    args = parser.parse_args()

    api_base_url = args.api_base_url.rstrip("/")
    web_base_url = args.web_base_url.rstrip("/")
    web_origin = f"{urlsplit(web_base_url).scheme}://{urlsplit(web_base_url).netloc}"

    try:
        health_status, _, health_body = request("GET", urljoin(api_base_url + "/", "health"), {}, args.timeout)
        if health_status >= 400:
            raise RuntimeError(f"API health failed with status {health_status}")
        payload = json.loads(health_body or "{}")
        if payload.get("status") != "ok":
            raise RuntimeError(f"API health payload unexpected: {payload}")

        cors_status, cors_headers, _ = request(
            "OPTIONS",
            urljoin(api_base_url + "/", "health"),
            {
                "Origin": web_origin,
                "Access-Control-Request-Method": "GET",
            },
            args.timeout,
        )
        if cors_status >= 400:
            raise RuntimeError(f"CORS preflight failed with status {cors_status}")
        allow_origin = (cors_headers.get("Access-Control-Allow-Origin") or cors_headers.get("access-control-allow-origin") or "").rstrip("/")
        allow_credentials = (cors_headers.get("Access-Control-Allow-Credentials") or cors_headers.get("access-control-allow-credentials") or "").lower()
        if allow_origin != web_origin:
            raise RuntimeError(
                f"CORS allow-origin mismatch: expected {web_origin}, received {allow_origin or '<missing>'}"
            )
        if allow_credentials != "true":
            raise RuntimeError("CORS allow-credentials header missing or not true.")

        web_status, web_headers, web_body = request("GET", web_base_url, {}, args.timeout)
        if web_status >= 400:
            raise RuntimeError(f"Web root failed with status {web_status}")
        require_html(web_status, web_headers, web_body, "Web root")
    except Exception as exc:  # noqa: BLE001
        print(f"Runtime surface smoke failed: {exc}", file=sys.stderr)
        return 1

    print("Runtime surface smoke passed")
    print(f"- api_base_url={api_base_url}")
    print(f"- web_base_url={web_base_url}")
    print(f"- web_origin={web_origin}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
