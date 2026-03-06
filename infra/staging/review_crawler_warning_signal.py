#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def fetch_telemetry(api_base_url: str, internal_token: str) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{api_base_url.rstrip('/')}/v1/admin/crawler-ops/telemetry",
        headers={"X-Internal-Token": internal_token},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8") or ""
        raise SystemExit(f"telemetry request failed: status={exc.code} body={body}") from exc
    if not isinstance(payload, dict):
        raise SystemExit("telemetry response was not a JSON object")
    return payload


def summarize(telemetry: dict[str, Any], min_jobs: int) -> dict[str, Any]:
    domains = [domain for domain in telemetry.get("domains", []) if isinstance(domain, dict)]
    alerts = [alert for alert in telemetry.get("alerts", []) if isinstance(alert, dict)]
    domain_by_name = {
        str(domain.get("domain")): domain for domain in domains if str(domain.get("domain") or "").strip()
    }

    low_sample_domains: list[dict[str, Any]] = []
    ready_domains: list[dict[str, Any]] = []
    for domain in sorted(domains, key=lambda item: str(item.get("domain") or "")):
        total_jobs = int(domain.get("total_jobs") or 0)
        enriched = {
            "domain": domain.get("domain"),
            "total_jobs": total_jobs,
            "failure_rate": float(domain.get("failure_rate") or 0.0),
            "parser_fallback_rate": float(domain.get("parser_fallback_rate") or 0.0),
            "parse_failure_rate": float(domain.get("parse_failure_rate") or 0.0),
            "retryable": int(domain.get("retryable") or 0),
            "avg_attempt_count": float(domain.get("avg_attempt_count") or 0.0),
            "top_parse_failure_classes": list(domain.get("top_parse_failure_classes") or []),
            "triage_hints": list(domain.get("triage_hints") or []),
        }
        if total_jobs < min_jobs:
            low_sample_domains.append(enriched)
        else:
            ready_domains.append(enriched)

    actionable_alerts: list[dict[str, Any]] = []
    low_sample_alerts: list[dict[str, Any]] = []
    for alert in alerts:
        domain_name = str(alert.get("domain") or "")
        domain = domain_by_name.get(domain_name, {})
        target = actionable_alerts if int(domain.get("total_jobs") or 0) >= min_jobs else low_sample_alerts
        target.append(
            {
                "domain": domain_name,
                "severity": alert.get("severity"),
                "metric": alert.get("metric"),
                "actual": alert.get("actual"),
                "threshold": alert.get("threshold"),
                "message": alert.get("message"),
            }
        )

    return {
        "generated_at": telemetry.get("generated_at"),
        "global": telemetry.get("global", {}),
        "actionable_alerts": actionable_alerts,
        "low_sample_alerts": low_sample_alerts,
        "low_sample_domains": low_sample_domains,
        "ready_domains": ready_domains,
    }


def markdown_report(summary: dict[str, Any], min_jobs: int) -> str:
    generated_at = summary.get("generated_at") or datetime.now(timezone.utc).isoformat()
    global_metrics = summary.get("global", {}) or {}
    lines = [
        f"# Crawler Warning Review - {generated_at}",
        "",
        "## Global",
        f"- total_jobs: `{global_metrics.get('total_jobs', 0)}`",
        f"- failed_jobs: `{global_metrics.get('failed_jobs', 0)}`",
        f"- retryable_jobs: `{global_metrics.get('retryable_jobs', 0)}`",
        f"- min_jobs_for_actionable_alerts: `{min_jobs}`",
        "",
        "## Actionable alerts",
    ]

    actionable_alerts = summary.get("actionable_alerts", [])
    if actionable_alerts:
        for alert in actionable_alerts:
            lines.append(
                "- `{domain}` `{metric}` `{actual}` > `{threshold}` ({severity}) - {message}".format(
                    domain=alert["domain"],
                    metric=alert["metric"],
                    actual=alert["actual"],
                    threshold=alert["threshold"],
                    severity=alert["severity"],
                    message=alert["message"],
                )
            )
    else:
        lines.append("- none")

    lines.extend(["", "## Low-sample alerts",])
    low_sample_alerts = summary.get("low_sample_alerts", [])
    if low_sample_alerts:
        for alert in low_sample_alerts:
            lines.append(
                "- `{domain}` `{metric}` is alerting before the domain has `{min_jobs}` jobs; treat as observational.".format(
                    domain=alert["domain"],
                    metric=alert["metric"],
                    min_jobs=min_jobs,
                )
            )
    else:
        lines.append("- none")

    lines.extend(["", "## Domains below min sample",])
    low_sample_domains = summary.get("low_sample_domains", [])
    if low_sample_domains:
        for domain in low_sample_domains:
            lines.append(
                "- `{domain}` jobs=`{total_jobs}` failure_rate=`{failure_rate}` fallback_rate=`{parser_fallback_rate}`".format(
                    **domain
                )
            )
    else:
        lines.append("- none")

    lines.extend(["", "## Ready domains to review",])
    ready_domains = summary.get("ready_domains", [])
    if ready_domains:
        for domain in ready_domains:
            top_failures = ", ".join(f"{name}:{count}" for name, count in domain["top_parse_failure_classes"][:3]) or "none"
            hints = "; ".join(str(item) for item in domain["triage_hints"][:2]) or "none"
            lines.append(
                "- `{domain}` jobs=`{total_jobs}` failure_rate=`{failure_rate}` parse_failure_rate=`{parse_failure_rate}` retryable=`{retryable}` top_parse_failures=`{top_failures}` hints=`{hints}`".format(
                    domain=domain["domain"],
                    total_jobs=domain["total_jobs"],
                    failure_rate=domain["failure_rate"],
                    parse_failure_rate=domain["parse_failure_rate"],
                    retryable=domain["retryable"],
                    top_failures=top_failures,
                    hints=hints,
                )
            )
    else:
        lines.append("- none")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Review crawler telemetry and separate actionable alerts from low-sample noise.")
    parser.add_argument("--api-base-url", default="", help="API base URL. Falls back to API_BASE_URL.")
    parser.add_argument("--internal-token", default="", help="Internal token. Falls back to INTERNAL_TOKEN.")
    parser.add_argument("--min-jobs", type=int, default=20, help="Minimum jobs before alerts are treated as actionable.")
    parser.add_argument("--output-md", default="", help="Optional markdown output path.")
    parser.add_argument("--output-json", default="", help="Optional JSON output path.")
    args = parser.parse_args()

    api_base_url = (args.api_base_url or "").strip() or os.environ.get("API_BASE_URL", "").strip()
    internal_token = (args.internal_token or "").strip() or os.environ.get("INTERNAL_TOKEN", "").strip()

    if not api_base_url:
        raise SystemExit("API base URL is required via --api-base-url or API_BASE_URL.")
    if not internal_token:
        raise SystemExit("Internal token is required via --internal-token or INTERNAL_TOKEN.")

    telemetry = fetch_telemetry(api_base_url, internal_token)
    summary = summarize(telemetry, args.min_jobs)
    report = markdown_report(summary, args.min_jobs)
    sys.stdout.write(report)

    if args.output_md:
        output_md = Path(args.output_md)
        output_md.parent.mkdir(parents=True, exist_ok=True)
        output_md.write_text(report, encoding="utf-8")
    if args.output_json:
        output_json = Path(args.output_json)
        output_json.parent.mkdir(parents=True, exist_ok=True)
        output_json.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
