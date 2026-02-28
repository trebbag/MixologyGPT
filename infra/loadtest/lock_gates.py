#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
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


def _round_rate(value: float) -> float:
    return float(f"{value:.4f}")


def _lock_rate_threshold(actual: float, current: float, floor: float, multiplier: float, margin: float) -> float:
    proposed = max((actual * multiplier) + margin, floor)
    # Locking should tighten thresholds, never loosen beyond the current policy.
    return _round_rate(min(current, proposed))


def _lock_latency_threshold(actual: float, current: float, floor: float, multiplier: float, margin: float) -> int:
    proposed = max((actual * multiplier) + margin, floor)
    # Locking should tighten thresholds, never loosen beyond the current policy.
    return int(round(min(current, proposed)))


def main() -> int:
    parser = argparse.ArgumentParser(description="Lock pilot gate thresholds from a passing run.")
    parser.add_argument("--stats", required=True, help="Path to locust *_stats.csv")
    parser.add_argument("--gates-in", required=True, help="Existing gate JSON path")
    parser.add_argument("--gates-out", required=True, help="Output gate JSON path")
    parser.add_argument("--run-id", default="", help="Optional run id label")
    parser.add_argument("--output-md", default="", help="Optional markdown report output path")
    args = parser.parse_args()

    stats_path = Path(args.stats)
    gates_in_path = Path(args.gates_in)
    gates_out_path = Path(args.gates_out)

    rows = _load_rows(stats_path)
    gates = json.loads(gates_in_path.read_text(encoding="utf-8"))

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

    locked = dict(gates)
    locked["non_harvest_error_rate_max"] = _lock_rate_threshold(
        actual=metrics["non_harvest_error_rate"],
        current=float(gates["non_harvest_error_rate_max"]),
        floor=0.005,
        multiplier=1.6,
        margin=0.002,
    )
    locked["harvest_429_rate_max"] = _lock_rate_threshold(
        actual=metrics["harvest_429_rate"],
        current=float(gates["harvest_429_rate_max"]),
        floor=0.05,
        multiplier=1.4,
        margin=0.01,
    )
    locked["search_error_rate_max"] = _lock_rate_threshold(
        actual=metrics["search_error_rate"],
        current=float(gates["search_error_rate_max"]),
        floor=0.003,
        multiplier=1.6,
        margin=0.001,
    )
    locked["studio_generate_error_rate_max"] = _lock_rate_threshold(
        actual=metrics["studio_generate_error_rate"],
        current=float(gates["studio_generate_error_rate_max"]),
        floor=0.003,
        multiplier=1.6,
        margin=0.001,
    )
    locked["search_p95_ms_max"] = _lock_latency_threshold(
        actual=metrics["search_p95_ms"],
        current=float(gates["search_p95_ms_max"]),
        floor=700,
        multiplier=1.15,
        margin=40,
    )
    locked["studio_generate_p95_ms_max"] = _lock_latency_threshold(
        actual=metrics["studio_generate_p95_ms"],
        current=float(gates["studio_generate_p95_ms_max"]),
        floor=600,
        multiplier=1.15,
        margin=40,
    )
    locked["aggregate_p95_ms_max"] = _lock_latency_threshold(
        actual=metrics["aggregate_p95_ms"],
        current=float(gates["aggregate_p95_ms_max"]),
        floor=900,
        multiplier=1.15,
        margin=60,
    )

    gates_out_path.write_text(json.dumps(locked, indent=2) + "\n", encoding="utf-8")

    if args.output_md:
        run_id = args.run_id or stats_path.stem.replace("_stats", "")
        lines = [
            f"# Locked Gates ({run_id})",
            "",
            f"- Source stats: `{stats_path}`",
            f"- Source gates: `{gates_in_path}`",
            f"- Locked gates: `{gates_out_path}`",
            "",
            "| Gate | Previous | Locked |",
            "|---|---:|---:|",
        ]
        for key in [
            "non_harvest_error_rate_max",
            "harvest_429_rate_max",
            "search_error_rate_max",
            "studio_generate_error_rate_max",
            "search_p95_ms_max",
            "studio_generate_p95_ms_max",
            "aggregate_p95_ms_max",
        ]:
            lines.append(f"| `{key}` | `{gates[key]}` | `{locked[key]}` |")
        Path(args.output_md).write_text("\n".join(lines) + "\n", encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
