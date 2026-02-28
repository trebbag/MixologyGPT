import re
from typing import Optional
from urllib.parse import urlparse

from prometheus_client import REGISTRY, Counter, Gauge


LABEL_SANITIZE_PATTERN = re.compile(r"[^a-zA-Z0-9_.:-]+")
PARSE_FAILURE_PATTERN = re.compile(r"parse failed \((?P<class>[a-z0-9_.:-]+)\)", re.IGNORECASE)
FETCH_FAILURE_PATTERN = re.compile(r"fetch_failed \((?P<class>[a-z0-9_.:-]+)\)", re.IGNORECASE)


def _counter(name: str, documentation: str, labelnames: list[str]) -> Counter:
    existing = REGISTRY._names_to_collectors.get(name)
    if isinstance(existing, Counter):
        return existing
    return Counter(name, documentation, labelnames)


def _gauge(name: str, documentation: str, labelnames: list[str]) -> Gauge:
    existing = REGISTRY._names_to_collectors.get(name)
    if isinstance(existing, Gauge):
        return existing
    return Gauge(name, documentation, labelnames)


crawler_jobs_total = _counter(
    "crawler_jobs_total",
    "Crawler job and parser outcomes by domain.",
    ["domain", "status", "parse_strategy"],
)

crawler_fallback_class_total = _counter(
    "crawler_fallback_class_total",
    "Crawler fallback parser classifications by domain.",
    ["domain", "fallback_class"],
)

crawler_parse_failures_total = _counter(
    "crawler_parse_failures_total",
    "Crawler parse failure classifications by domain.",
    ["domain", "failure_class"],
)

crawler_compliance_rejections_total = _counter(
    "crawler_compliance_rejections_total",
    "Crawler compliance rejections by reason and domain.",
    ["domain", "reason"],
)

crawler_domain_failure_rate = _gauge(
    "crawler_domain_failure_rate",
    "Current crawler failure rate per domain.",
    ["domain"],
)

crawler_domain_retryable_jobs = _gauge(
    "crawler_domain_retryable_jobs",
    "Current crawler retryable queue per domain.",
    ["domain"],
)

crawler_domain_parser_fallback_rate = _gauge(
    "crawler_domain_parser_fallback_rate",
    "Current crawler parser fallback rate per domain.",
    ["domain"],
)

crawler_domain_avg_attempt_count = _gauge(
    "crawler_domain_avg_attempt_count",
    "Current crawler average attempt count per domain.",
    ["domain"],
)

crawler_domain_compliance_rejections = _gauge(
    "crawler_domain_compliance_rejections",
    "Current crawler compliance rejection count per domain.",
    ["domain"],
)


def _normalize_domain(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host or "unknown"


def _label(value: str, default: str) -> str:
    cleaned = LABEL_SANITIZE_PATTERN.sub("_", (value or "").strip().lower())
    return cleaned or default


def record_auto_harvest_metrics(
    source_url: str,
    parser_stats: dict[str, int],
    fallback_class_counts: dict[str, int],
    parse_failure_counts: dict[str, int],
    compliance_reason_counts: dict[str, int],
) -> None:
    domain = _normalize_domain(source_url)
    for strategy, count in (parser_stats or {}).items():
        if count <= 0:
            continue
        crawler_jobs_total.labels(
            domain=domain,
            status="parsed",
            parse_strategy=_label(strategy, "unknown"),
        ).inc(count)
    for fallback_class, count in (fallback_class_counts or {}).items():
        if count <= 0:
            continue
        crawler_fallback_class_total.labels(
            domain=domain,
            fallback_class=_label(fallback_class, "unclassified"),
        ).inc(count)
    for failure_class, count in (parse_failure_counts or {}).items():
        if count <= 0:
            continue
        crawler_parse_failures_total.labels(
            domain=domain,
            failure_class=_label(failure_class, "unknown_parse_failure"),
        ).inc(count)
    for reason, count in (compliance_reason_counts or {}).items():
        if count <= 0:
            continue
        crawler_compliance_rejections_total.labels(
            domain=domain,
            reason=_label(reason, "unknown_reason"),
        ).inc(count)


def record_harvest_job_metrics(
    source_url: str,
    status: str,
    parse_strategy: Optional[str],
    compliance_reasons: Optional[list[str]],
    error: Optional[str],
) -> None:
    domain = _normalize_domain(source_url)
    strategy_label = _label(parse_strategy or "unknown", "unknown")
    crawler_jobs_total.labels(
        domain=domain,
        status=_label(status, "unknown"),
        parse_strategy=strategy_label,
    ).inc()
    if strategy_label.startswith("dom_fallback"):
        parts = strategy_label.split(":", 1)
        fallback_class = parts[1] if len(parts) == 2 else "unclassified"
        if "@" in fallback_class:
            fallback_class = fallback_class.split("@", 1)[0]
        crawler_fallback_class_total.labels(
            domain=domain,
            fallback_class=_label(fallback_class, "unclassified"),
        ).inc()
    if strategy_label.startswith("fetch_failed:"):
        failure_class = strategy_label.split(":", 1)[1] if ":" in strategy_label else "unknown-fetch-failure"
        if "@" in failure_class:
            failure_class = failure_class.split("@", 1)[0]
        crawler_parse_failures_total.labels(
            domain=domain,
            failure_class=_label(f"fetch_failed:{failure_class}", "unknown_fetch_failure"),
        ).inc()
    for reason in compliance_reasons or []:
        crawler_compliance_rejections_total.labels(
            domain=domain,
            reason=_label(reason, "unknown_reason"),
        ).inc()
    if error:
        match = PARSE_FAILURE_PATTERN.search(error)
        if match:
            crawler_parse_failures_total.labels(
                domain=domain,
                failure_class=_label(match.group("class"), "unknown_parse_failure"),
            ).inc()
        fetch_match = FETCH_FAILURE_PATTERN.search(error)
        if fetch_match:
            crawler_parse_failures_total.labels(
                domain=domain,
                failure_class=_label(f"fetch_failed:{fetch_match.group('class')}", "unknown_fetch_failure"),
            ).inc()


def update_domain_telemetry_gauges(
    domain: str,
    failure_rate: float,
    retryable_jobs: int,
    parser_fallback_rate: float,
    avg_attempt_count: float,
    compliance_rejections: int,
) -> None:
    label = _normalize_domain(domain)
    crawler_domain_failure_rate.labels(domain=label).set(max(failure_rate, 0.0))
    crawler_domain_retryable_jobs.labels(domain=label).set(max(float(retryable_jobs), 0.0))
    crawler_domain_parser_fallback_rate.labels(domain=label).set(max(parser_fallback_rate, 0.0))
    crawler_domain_avg_attempt_count.labels(domain=label).set(max(avg_attempt_count, 0.0))
    crawler_domain_compliance_rejections.labels(domain=label).set(max(float(compliance_rejections), 0.0))
