from __future__ import annotations

import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException, Query, Request
import urllib.parse


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_list(name: str) -> list[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


@dataclass
class ReceivedAlert:
    received_at: datetime
    alertname: str
    run_id: str
    status: str
    severity: str
    summary: str


@dataclass
class ForwardAttempt:
    attempted_at: datetime
    alertname: str
    run_id: str
    destination: str
    target: str
    ok: bool
    status_code: Optional[int]
    error: str


class AlertStore:
    def __init__(self) -> None:
        self._alerts: list[ReceivedAlert] = []
        self._forwards: list[ForwardAttempt] = []

    def record(self, alert: ReceivedAlert) -> None:
        self._alerts.append(alert)
        # Keep a small tail for smoke/debug.
        if len(self._alerts) > 50:
            self._alerts = self._alerts[-50:]

    def recent(self, window_seconds: int) -> list[ReceivedAlert]:
        cutoff = _utcnow().timestamp() - max(float(window_seconds), 0.0)
        return [a for a in self._alerts if a.received_at.timestamp() >= cutoff]

    def record_forward(self, attempt: ForwardAttempt) -> None:
        self._forwards.append(attempt)
        if len(self._forwards) > 150:
            self._forwards = self._forwards[-150:]

    def recent_forwards(self, window_seconds: int) -> list[ForwardAttempt]:
        cutoff = _utcnow().timestamp() - max(float(window_seconds), 0.0)
        return [a for a in self._forwards if a.attempted_at.timestamp() >= cutoff]


store = AlertStore()

app = FastAPI(title="BartenderAI Alert Receiver", version="0.1.0")


def _redact_url(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    try:
        parsed = urllib.parse.urlparse(raw)
        scheme = parsed.scheme or "http"
        host = parsed.hostname or ""
        port = f":{parsed.port}" if parsed.port else ""
        if host:
            return f"{scheme}://{host}{port}"
    except Exception:  # noqa: BLE001
        pass
    # Best-effort fallback; avoid leaking query params/tokens.
    return raw.split("?", 1)[0].split("#", 1)[0]


async def _forward_webhook(url: str, payload: Any, timeout: float = 10.0) -> tuple[Optional[int], Optional[str]]:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(url, json=payload)
            if res.status_code >= 400:
                return res.status_code, f"http_{res.status_code}"
    except Exception as exc:  # noqa: BLE001
        return None, type(exc).__name__
    return res.status_code, None


async def _forward_slack(webhook_url: str, alerts: list[ReceivedAlert]) -> tuple[Optional[int], Optional[str]]:
    if not webhook_url:
        return None, None
    lines = []
    for alert in alerts[:6]:
        sev = alert.severity or "unknown"
        name = alert.alertname or "unknown"
        status = alert.status or "unknown"
        summary = alert.summary or ""
        lines.append(f"[{sev}] {name} ({status}) {summary}".strip())
    text = "\n".join(lines) if lines else "Alert received"
    return await _forward_webhook(webhook_url, {"text": text})


async def _forward_pagerduty(
    routing_key: str, status: str, alerts: list[ReceivedAlert], events_url: str
) -> tuple[Optional[int], Optional[str]]:
    if not routing_key:
        return None, None
    # PagerDuty v2 Events API
    action = "resolve" if status == "resolved" else "trigger"
    dedup_key = f"bartenderai:{alerts[0].alertname if alerts else 'alert'}"
    summary = alerts[0].summary if alerts else "Alert received"
    severity = (alerts[0].severity if alerts else "warning") or "warning"
    payload = {
        "routing_key": routing_key,
        "event_action": action,
        "dedup_key": dedup_key,
        "payload": {
            "summary": summary[:1024],
            "source": "bartenderai-alert-receiver",
            "severity": severity if severity in {"critical", "error", "warning", "info"} else "warning",
            "timestamp": _utcnow().isoformat(),
            "component": "alertmanager",
            "group": "bartenderai",
            "class": "alert",
        },
    }
    return await _forward_webhook(events_url, payload)


def _extract_received_alerts(body: Any) -> tuple[str, list[ReceivedAlert]]:
    # Alertmanager webhook payload is usually an object with `status` and `alerts`.
    status = "firing"
    raw_alerts: list[dict[str, Any]] = []

    if isinstance(body, dict):
        status = str(body.get("status") or status).strip().lower() or status
        alerts_value = body.get("alerts")
        if isinstance(alerts_value, list):
            raw_alerts = [a for a in alerts_value if isinstance(a, dict)]
    elif isinstance(body, list):
        raw_alerts = [a for a in body if isinstance(a, dict)]

    received: list[ReceivedAlert] = []
    for raw in raw_alerts[:25]:
        labels = raw.get("labels") if isinstance(raw.get("labels"), dict) else {}
        annotations = raw.get("annotations") if isinstance(raw.get("annotations"), dict) else {}
        received.append(
            ReceivedAlert(
                received_at=_utcnow(),
                alertname=str(labels.get("alertname") or "unknown"),
                run_id=str(labels.get("run_id") or ""),
                status=str(raw.get("status") or status),
                severity=str(labels.get("severity") or "warning"),
                summary=str(annotations.get("summary") or annotations.get("description") or ""),
            )
        )
    if not received:
        received = [
            ReceivedAlert(
                received_at=_utcnow(),
                alertname="unknown",
                run_id="",
                status=status,
                severity="warning",
                summary="",
            )
        ]
    return status, received


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

@app.post("/dev/sink")
async def dev_sink(request: Request) -> dict[str, Any]:
    # Intentionally unauthenticated and minimal. This is used for local/staging smoke tests
    # where we want to verify downstream forwarding without hitting a real external system.
    _ = await request.json()
    return {"status": "ok"}


@app.post("/alerts")
async def receive_alerts(
    request: Request,
    x_alert_receiver_token: Optional[str] = Header(default=None, alias="X-Alert-Receiver-Token"),
) -> dict[str, Any]:
    expected = os.getenv("ALERT_RECEIVER_SHARED_SECRET", "").strip()
    if expected and x_alert_receiver_token != expected:
        raise HTTPException(status_code=403, detail="Forbidden")

    body = await request.json()
    status, received = _extract_received_alerts(body)
    for alert in received:
        store.record(alert)

    slack_webhook_url = os.getenv("SLACK_WEBHOOK_URL", "").strip()
    pagerduty_routing_key = os.getenv("PAGERDUTY_ROUTING_KEY", "").strip()
    pagerduty_events_url = os.getenv("PAGERDUTY_EVENTS_URL", "https://events.pagerduty.com/v2/enqueue").strip()
    if not pagerduty_events_url:
        pagerduty_events_url = "https://events.pagerduty.com/v2/enqueue"
    forward_urls = _env_list("FORWARD_WEBHOOK_URLS")
    primary = received[0]

    forward_errors: list[str] = []
    slack_status, slack_err = await _forward_slack(slack_webhook_url, received)
    if slack_webhook_url:
        store.record_forward(
            ForwardAttempt(
                attempted_at=_utcnow(),
                alertname=primary.alertname,
                run_id=primary.run_id,
                destination="slack",
                target=_redact_url(slack_webhook_url),
                ok=slack_err is None,
                status_code=slack_status,
                error=slack_err or "",
            )
        )
    if slack_err:
        forward_errors.append(f"slack:{slack_err}")

    pd_status, pd_err = await _forward_pagerduty(
        pagerduty_routing_key,
        status=status,
        alerts=received,
        events_url=pagerduty_events_url,
    )
    if pagerduty_routing_key:
        store.record_forward(
            ForwardAttempt(
                attempted_at=_utcnow(),
                alertname=primary.alertname,
                run_id=primary.run_id,
                destination="pagerduty",
                target=_redact_url(pagerduty_events_url),
                ok=pd_err is None,
                status_code=pd_status,
                error=pd_err or "",
            )
        )
    if pd_err:
        forward_errors.append(f"pagerduty:{pd_err}")

    for url in forward_urls:
        status_code, err = await _forward_webhook(url, body)
        store.record_forward(
            ForwardAttempt(
                attempted_at=_utcnow(),
                alertname=primary.alertname,
                run_id=primary.run_id,
                destination="webhook",
                target=_redact_url(url),
                ok=err is None,
                status_code=status_code,
                error=err or "",
            )
        )
        if err:
            forward_errors.append(f"webhook:{_redact_url(url)}:{err}")

    return {
        "status": "ok",
        "received": len(received),
        "forward_errors": forward_errors,
        "received_at": _utcnow().isoformat(),
    }


@app.get("/smoke/confirm")
async def confirm_alert_received(
    alertname: Optional[str] = Query(default=None),
    run_id: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    expected = os.getenv("ALERT_RECEIVER_CONFIRM_TOKEN", "").strip()
    if expected:
        token = ""
        if authorization and authorization.lower().startswith("bearer "):
            token = authorization.split(" ", 1)[1].strip()
        if token != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")

    window_seconds = _env_int("CONFIRM_WINDOW_SECONDS", _env_int("ALERT_RECEIVER_CONFIRM_WINDOW_SECONDS", 120))
    recent = store.recent(window_seconds)
    if alertname:
        recent = [a for a in recent if a.alertname == alertname]
    if run_id:
        recent = [a for a in recent if a.run_id == run_id]
    if not recent:
        raise HTTPException(status_code=404, detail="No recent alerts received")
    latest = max(recent, key=lambda a: a.received_at.timestamp())
    return {
        "status": "ok",
        "window_seconds": window_seconds,
        "latest": {
            "alertname": latest.alertname,
            "run_id": latest.run_id,
            "severity": latest.severity,
            "status": latest.status,
            "received_at": latest.received_at.isoformat(),
            "age_seconds": round(time.time() - latest.received_at.timestamp(), 2),
        },
        "recent_count": len(recent),
    }


@app.get("/smoke/confirm-forward")
async def confirm_forward_attempt(
    alertname: Optional[str] = Query(default=None),
    run_id: Optional[str] = Query(default=None),
    destination: Optional[str] = Query(default=None, description="slack|pagerduty|webhook"),
    require_ok: bool = Query(default=True, description="Only consider successful forwards"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    expected = os.getenv("ALERT_RECEIVER_CONFIRM_TOKEN", "").strip()
    if expected:
        token = ""
        if authorization and authorization.lower().startswith("bearer "):
            token = authorization.split(" ", 1)[1].strip()
        if token != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")

    window_seconds = _env_int("CONFIRM_WINDOW_SECONDS", _env_int("ALERT_RECEIVER_CONFIRM_WINDOW_SECONDS", 120))
    recent = store.recent_forwards(window_seconds)
    if alertname:
        recent = [a for a in recent if a.alertname == alertname]
    if run_id:
        recent = [a for a in recent if a.run_id == run_id]
    if destination:
        destination_norm = destination.strip().lower()
        recent = [a for a in recent if a.destination == destination_norm]
    if require_ok:
        recent = [a for a in recent if a.ok]
    if not recent:
        raise HTTPException(status_code=404, detail="No recent forward attempts")

    latest = max(recent, key=lambda a: a.attempted_at.timestamp())
    return {
        "status": "ok",
        "window_seconds": window_seconds,
        "latest": {
            "alertname": latest.alertname,
            "run_id": latest.run_id,
            "destination": latest.destination,
            "target": latest.target,
            "ok": latest.ok,
            "status_code": latest.status_code,
            "error": latest.error,
            "attempted_at": latest.attempted_at.isoformat(),
            "age_seconds": round(time.time() - latest.attempted_at.timestamp(), 2),
        },
        "recent_count": len(recent),
    }
