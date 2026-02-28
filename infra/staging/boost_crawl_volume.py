#!/usr/bin/env python3
"""
Staging ops helper: increase crawl volume on approved domains until MIN_JOBS is reached,
then run alert-threshold calibration apply.

This script is intentionally stdlib-only (no extra pip deps). It relies on:
- /v1/recipes/harvest/policies (X-Internal-Token)
- /v1/recipes/harvest/auto (X-Internal-Token)
- /v1/recipes/harvest/jobs/pending + /run (X-Internal-Token)
- /v1/admin/source-policies/calibrate-alerts (X-Internal-Token)
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


DEFAULT_LOW_SAMPLE_DOMAINS = (
    "bbcgoodfood.com",
    "diffordsguide.com",
    "food.com",
    "imbibemagazine.com",
    "punchdrink.com",
    "liquor.com",
)

# When a policy only contains a single seed URL, crawl coverage can stagnate quickly and prevent
# calibration from reaching MIN_JOBS. These extra seeds are used only by this staging ops script,
# without mutating policy seed_urls, to increase sampling diversity.
EXTRA_SEEDS_BY_DOMAIN: dict[str, list[str]] = {
    "bbcgoodfood.com": [
        "https://www.bbcgoodfood.com/recipes/collection/gin-cocktail-recipes",
        "https://www.bbcgoodfood.com/recipes/collection/vodka-cocktail-recipes",
        "https://www.bbcgoodfood.com/recipes/collection/whisky-cocktail-recipes",
        "https://www.bbcgoodfood.com/recipes/collection/tequila-cocktail-recipes",
    ],
    "imbibemagazine.com": [
        "https://imbibemagazine.com/category/cocktails-spirits-recipes",
        "https://imbibemagazine.com/category/how-to-recipes",
        "https://imbibemagazine.com/category/holiday-drinks-recipes",
        "https://imbibemagazine.com/category/recipes/page/2/",
        "https://imbibemagazine.com/category/recipes/page/3/",
    ],
    "food.com": [
        "https://www.food.com/",
        "https://www.food.com/recipes/",
    ],
    # Punch uses infinite scroll on /recipes/ and does not expose stable pagination paths,
    # so we lean on its sitemap + RSS feed for sampling diversity.
    "punchdrink.com": [
        # Root enables sitemap discovery defaults in the crawler.
        "https://punchdrink.com/",
        "https://punchdrink.com/recipes/feed/",
        "https://punchdrink.com/sitemap.xml",
        "https://punchdrink.com/sitemap_index.xml",
    ],
    "liquor.com": [
        "https://www.liquor.com/cocktail-recipes-4779427",
        "https://www.liquor.com/classic-cocktail-recipes-4844600",
        "https://www.liquor.com/most-popular-cocktails-5020574",
    ],
}


@dataclass
class HttpResult:
    status: int
    payload: Any


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _request_json(
    method: str,
    url: str,
    token: str,
    body: Optional[dict[str, Any]] = None,
    timeout: float = 90.0,
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


def _calibration(
    api_base_url: str,
    token: str,
    apply: bool,
    min_jobs: int,
    buffer_multiplier: float,
) -> dict[str, Any]:
    query = urllib.parse.urlencode(
        {
            "apply": "true" if apply else "false",
            "min_jobs": str(min_jobs),
            "buffer_multiplier": str(buffer_multiplier),
        }
    )
    url = f"{api_base_url}/v1/admin/source-policies/calibrate-alerts?{query}"
    res = _request_json("POST", url, token=token, body={}, timeout=90.0)
    if res.status >= 400:
        raise RuntimeError(f"Calibration failed: HTTP {res.status} {res.payload}")
    return res.payload or {}


def _policy_list(api_base_url: str, token: str) -> list[dict[str, Any]]:
    url = f"{api_base_url}/v1/recipes/harvest/policies?limit=200"
    res = _request_json("GET", url, token=token, body=None, timeout=30.0)
    if res.status >= 400:
        raise RuntimeError(f"Harvest policies fetch failed: HTTP {res.status} {res.payload}")
    if not isinstance(res.payload, list):
        return []
    return list(res.payload)


def _auto_harvest(api_base_url: str, token: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = f"{api_base_url}/v1/recipes/harvest/auto"
    res = _request_json("POST", url, token=token, body=payload, timeout=120.0)
    if res.status >= 400:
        raise RuntimeError(f"Auto-harvest failed: HTTP {res.status} {res.payload}")
    return res.payload or {}


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
    res = _request_json("POST", url, token=token, body={}, timeout=60.0)
    if res.status >= 400:
        # Keep going; the job row should still have failure details recorded.
        return {"status": "error", "http_status": res.status, "payload": res.payload}
    return res.payload or {}


def _job_counts_from_calibration(calibration: dict[str, Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for rec in calibration.get("recommendations", []) or []:
        domain = str(rec.get("domain") or "").strip().lower()
        if not domain:
            continue
        if isinstance(rec.get("total_jobs"), int):
            counts[domain] = int(rec["total_jobs"])
            continue
        reason = str(rec.get("reason") or "")
        if reason.startswith("insufficient_jobs:"):
            try:
                counts[domain] = int(reason.split(":", 1)[1])
                continue
            except ValueError:
                pass
        if reason == "no_telemetry":
            counts[domain] = 0
    return counts


def main() -> int:
    api_base_url = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
    token = os.getenv("INTERNAL_TOKEN", "").strip()
    if not token:
        print("INTERNAL_TOKEN is required", file=sys.stderr)
        return 2

    min_jobs = int(os.getenv("MIN_JOBS", "20"))
    buffer_multiplier = float(os.getenv("BUFFER_MULTIPLIER", "1.25"))
    max_rounds = int(os.getenv("MAX_ROUNDS", "6"))
    drain_cycles = int(os.getenv("DRAIN_CYCLES", "10"))
    pending_limit = int(os.getenv("PENDING_LIMIT", "20"))
    sleep_seconds = float(os.getenv("SLEEP_SECONDS", "1.0"))

    boost_max_pages = int(os.getenv("BOOST_MAX_PAGES", "80"))
    boost_max_recipes = int(os.getenv("BOOST_MAX_RECIPES", "40"))
    boost_max_links = int(os.getenv("BOOST_MAX_LINKS", "200"))
    boost_crawl_depth = int(os.getenv("BOOST_CRAWL_DEPTH", "2"))
    seed_limit = int(os.getenv("SEED_LIMIT", "4"))

    target_domains_env = os.getenv("TARGET_DOMAINS", "").strip()
    if target_domains_env:
        target_domains = tuple(
            part.strip().lower() for part in target_domains_env.split(",") if part.strip()
        )
    else:
        target_domains = DEFAULT_LOW_SAMPLE_DOMAINS

    run_id = os.getenv("RUN_ID", datetime.utcnow().strftime("%Y-%m-%d_%H%M%S"))
    evidence_dir = os.getenv(
        "EVIDENCE_DIR",
        os.path.join(os.path.dirname(__file__), "..", "..", "docs", "runbooks", "evidence"),
    )
    os.makedirs(evidence_dir, exist_ok=True)
    evidence_path = os.path.join(evidence_dir, f"staging-boost-crawl-{run_id}.json")
    calibration_apply_path = os.path.join(evidence_dir, f"calibration-apply-{run_id}.json")

    evidence: dict[str, Any] = {
        "run_id": run_id,
        "api_base_url": api_base_url,
        "min_jobs": min_jobs,
        "target_domains": list(target_domains),
        "started_at": datetime.utcnow().isoformat(),
        "rounds": [],
        "final_counts": {},
    }

    policies = _policy_list(api_base_url, token)
    policy_by_domain: dict[str, dict[str, Any]] = {
        str(policy.get("domain") or "").strip().lower(): policy for policy in policies
    }
    enabled_target_domains = [domain for domain in target_domains if domain in policy_by_domain]
    missing_policy_domains = [domain for domain in target_domains if domain not in policy_by_domain]
    evidence["missing_policy_domains"] = missing_policy_domains
    if missing_policy_domains:
        print(
            "Skipping target domains without active policy: "
            + ", ".join(missing_policy_domains),
            file=sys.stderr,
        )
    if not enabled_target_domains:
        print("No target domains have active policies; nothing to boost.", file=sys.stderr)
        with open(evidence_path, "w", encoding="utf-8") as handle:
            json.dump(evidence, handle, indent=2, sort_keys=True)
        return 1

    for round_idx in range(1, max_rounds + 1):
        preview = _calibration(
            api_base_url=api_base_url,
            token=token,
            apply=False,
            min_jobs=min_jobs,
            buffer_multiplier=buffer_multiplier,
        )
        counts = _job_counts_from_calibration(preview)
        missing = [d for d in enabled_target_domains if counts.get(d, 0) < min_jobs]
        print(
            f"[round {round_idx}] counts={{{', '.join(f'{d}:{counts.get(d,0)}' for d in target_domains)}}}"
        )
        if not missing:
            print("All target domains meet MIN_JOBS. Stopping boost.")
            break

        round_log: dict[str, Any] = {
            "round": round_idx,
            "before_counts": {d: counts.get(d, 0) for d in target_domains},
            "auto_harvest": [],
            "drain": [],
        }

        for domain in missing:
            policy = policy_by_domain.get(domain)
            if not policy:
                round_log["auto_harvest"].append({"domain": domain, "status": "skipped", "reason": "no_policy"})
                continue
            seeds = policy.get("seed_urls") or []
            if not isinstance(seeds, list):
                seeds = []
            # Add extra seeds if a domain is still low-sample so we can reach MIN_JOBS faster.
            seed_candidates = [*seeds, *EXTRA_SEEDS_BY_DOMAIN.get(domain, [])]
            # Dedupe while preserving order.
            seen_seeds: set[str] = set()
            deduped_seeds: list[str] = []
            for seed in seed_candidates:
                seed_str = str(seed or "").strip()
                if not seed_str or seed_str in seen_seeds:
                    continue
                seen_seeds.add(seed_str)
                deduped_seeds.append(seed_str)
            if not deduped_seeds:
                round_log["auto_harvest"].append({"domain": domain, "status": "skipped", "reason": "no_seed_urls"})
                continue

            # Increase crawl volume each round without rewriting policy defaults.
            policy_max_pages = int(policy.get("max_pages") or 40)
            policy_max_recipes = int(policy.get("max_recipes") or 20)
            policy_depth = int(policy.get("crawl_depth") or 2)
            respect_robots = bool(policy.get("respect_robots", True))

            max_pages = min(boost_max_pages, max(policy_max_pages, 40) + (round_idx - 1) * 20)
            max_recipes = min(boost_max_recipes, max(policy_max_recipes, 20) + (round_idx - 1) * 10)
            max_links = max(boost_max_links, max_pages)
            crawl_depth = max(boost_crawl_depth, policy_depth)

            for seed in deduped_seeds[: max(seed_limit, 1)]:
                payload = {
                    "source_url": seed,
                    "source_type": "web",
                    "max_links": max_links,
                    "max_pages": max_pages,
                    "max_recipes": max_recipes,
                    "crawl_depth": crawl_depth,
                    "respect_robots": respect_robots,
                    "enqueue": True,
                }
                result = _auto_harvest(api_base_url, token, payload)
                round_log["auto_harvest"].append(
                    {
                        "domain": domain,
                        "seed_url": seed,
                        "request": payload,
                        "queued_jobs": len(result.get("queued_job_ids") or []),
                        "parsed_count": int(result.get("parsed_count") or 0),
                        "compliance_rejections": int(result.get("compliance_rejections") or 0),
                        "skip_reason_counts": result.get("skip_reason_counts") or {},
                        "errors_sample": (result.get("errors") or [])[:5],
                    }
                )

        # Drain pending jobs to turn volume into usable telemetry.
        for cycle in range(1, drain_cycles + 1):
            pending = _pending_jobs(api_base_url, token, pending_limit)
            if not pending:
                round_log["drain"].append({"cycle": cycle, "pending": 0})
                break
            cycle_log: dict[str, Any] = {"cycle": cycle, "pending": len(pending), "jobs": []}
            for job in pending:
                job_id = str(job.get("id") or "")
                if not job_id:
                    continue
                result = _run_job(api_base_url, token, job_id)
                cycle_log["jobs"].append(
                    {
                        "job_id": job_id,
                        "status": result.get("status"),
                        "parse_strategy": result.get("parse_strategy"),
                        "error": result.get("error"),
                        "compliance_reasons": result.get("compliance_reasons"),
                    }
                )
            round_log["drain"].append(cycle_log)
            time.sleep(0.2)

        evidence["rounds"].append(round_log)
        time.sleep(max(sleep_seconds, 0.0))

    final_preview = _calibration(
        api_base_url=api_base_url,
        token=token,
        apply=False,
        min_jobs=min_jobs,
        buffer_multiplier=buffer_multiplier,
    )
    final_counts = _job_counts_from_calibration(final_preview)
    evidence["final_counts"] = {d: final_counts.get(d, 0) for d in target_domains}

    # Apply calibration if we met the threshold or if operator wants to persist anyway.
    apply_calibration = _env_bool("APPLY_CALIBRATION", True)
    calibration_apply = None
    if apply_calibration:
        calibration_apply = _calibration(
            api_base_url=api_base_url,
            token=token,
            apply=True,
            min_jobs=min_jobs,
            buffer_multiplier=buffer_multiplier,
        )
        with open(calibration_apply_path, "w", encoding="utf-8") as handle:
            json.dump(calibration_apply, handle, indent=2, sort_keys=True)

    evidence["calibration_apply_written"] = bool(calibration_apply is not None)
    evidence["finished_at"] = datetime.utcnow().isoformat()
    with open(evidence_path, "w", encoding="utf-8") as handle:
        json.dump(evidence, handle, indent=2, sort_keys=True)

    unmet = [d for d in enabled_target_domains if final_counts.get(d, 0) < min_jobs]
    print(f"Evidence: {evidence_path}")
    if calibration_apply is not None:
        print(f"Calibration apply: {calibration_apply_path}")
    if unmet:
        print(f"Unmet MIN_JOBS for domains: {', '.join(unmet)}", file=sys.stderr)
        return 1
    print("Boost complete: all target domains meet MIN_JOBS.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
