#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any


def _to_int(value: str) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _to_float(value: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _load_rows(path: Path) -> dict[str, dict[str, Any]]:
    by_name: dict[str, dict[str, Any]] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            name = (row.get("Name") or "").strip()
            by_name[name] = row
    return by_name


def _percent(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return numerator / denominator


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate load test gate thresholds.")
    parser.add_argument("--stats", required=True, help="Path to locust *_stats.csv")
    parser.add_argument("--gates", required=True, help="Path to gate JSON config")
    parser.add_argument("--run-id", default="", help="Optional run id label")
    parser.add_argument("--output-md", default="", help="Optional markdown report output path")
    args = parser.parse_args()

    stats_path = Path(args.stats)
    gates_path = Path(args.gates)
    rows = _load_rows(stats_path)
    with gates_path.open(encoding="utf-8") as handle:
        gates = json.load(handle)

    aggregate = rows.get("Aggregated", {})
    harvest = rows.get("harvest_auto", {})
    search = rows.get("recipes_search", {})
    studio_generate = rows.get("studio_generate", {})

    request_total = _to_int(aggregate.get("Request Count", "0"))
    failure_total = _to_int(aggregate.get("Failure Count", "0"))
    harvest_requests = _to_int(harvest.get("Request Count", "0"))
    harvest_failures = _to_int(harvest.get("Failure Count", "0"))
    non_harvest_requests = max(request_total - harvest_requests, 0)
    non_harvest_failures = max(failure_total - harvest_failures, 0)

    metrics = {
        "non_harvest_error_rate": _percent(non_harvest_failures, non_harvest_requests),
        "harvest_429_rate": _percent(harvest_failures, harvest_requests),
        "search_error_rate": _percent(
            _to_int(search.get("Failure Count", "0")),
            _to_int(search.get("Request Count", "0")),
        ),
        "studio_generate_error_rate": _percent(
            _to_int(studio_generate.get("Failure Count", "0")),
            _to_int(studio_generate.get("Request Count", "0")),
        ),
        "search_p95_ms": _to_float(search.get("95%", "0")),
        "studio_generate_p95_ms": _to_float(studio_generate.get("95%", "0")),
        "aggregate_p95_ms": _to_float(aggregate.get("95%", "0")),
    }

    checks = [
        ("non_harvest_error_rate", "<=", gates["non_harvest_error_rate_max"]),
        ("harvest_429_rate", "<=", gates["harvest_429_rate_max"]),
        ("search_error_rate", "<=", gates["search_error_rate_max"]),
        ("studio_generate_error_rate", "<=", gates["studio_generate_error_rate_max"]),
        ("search_p95_ms", "<=", gates["search_p95_ms_max"]),
        ("studio_generate_p95_ms", "<=", gates["studio_generate_p95_ms_max"]),
        ("aggregate_p95_ms", "<=", gates["aggregate_p95_ms_max"]),
    ]

    results: list[dict[str, Any]] = []
    passed = True
    for metric_name, comparator, threshold in checks:
        actual = metrics[metric_name]
        ok = actual <= threshold
        passed = passed and ok
        results.append(
            {
                "metric": metric_name,
                "actual": actual,
                "threshold": threshold,
                "comparator": comparator,
                "result": "PASS" if ok else "FAIL",
            }
        )

    summary = {
        "run_id": args.run_id or stats_path.stem.replace("_stats", ""),
        "stats_path": str(stats_path),
        "gates_path": str(gates_path),
        "request_total": request_total,
        "failure_total": failure_total,
        "overall_result": "PASS" if passed else "FAIL",
        "results": results,
    }

    print(json.dumps(summary, indent=2))

    if args.output_md:
        md_path = Path(args.output_md)
        lines = [
            f"# Load Gate Evaluation ({summary['run_id']})",
            "",
            f"- Stats file: `{stats_path}`",
            f"- Gates file: `{gates_path}`",
            f"- Total requests: `{request_total}`",
            f"- Total failures: `{failure_total}`",
            f"- Overall result: `{summary['overall_result']}`",
            "",
            "| Metric | Actual | Threshold | Result |",
            "|---|---:|---:|---|",
        ]
        for row in results:
            lines.append(
                f"| `{row['metric']}` | `{row['actual']:.4f}` | `{row['threshold']}` | `{row['result']}` |"
            )
        md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    return 0 if passed else 2


if __name__ == "__main__":
    sys.exit(main())
