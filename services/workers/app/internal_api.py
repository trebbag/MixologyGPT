import logging
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class InternalApiResponse:
    status_code: int
    payload: Any
    text: str


class InternalApiError(RuntimeError):
    def __init__(self, method: str, path: str, status_code: int, detail: str):
        self.method = method
        self.path = path
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"{method} {path} failed ({status_code}): {detail}")


def _build_url(path: str) -> str:
    return f"{settings.api_url.rstrip('/')}{path}"


def _extract_error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        payload = None

    if isinstance(payload, dict):
        detail = payload.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail.strip()
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()

    text = (response.text or "").strip()
    return text or response.reason_phrase or f"HTTP {response.status_code}"


def _decode_payload(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return None


def request_internal(
    method: str,
    path: str,
    *,
    client: Optional[httpx.Client] = None,
    params: Optional[dict[str, Any]] = None,
    json: Optional[dict[str, Any]] = None,
    timeout: float = 30.0,
) -> InternalApiResponse:
    url = _build_url(path)
    if client is None:
        with httpx.Client() as ephemeral_client:
            response = ephemeral_client.request(
                method,
                url,
                headers={"X-Internal-Token": settings.internal_token},
                params=params,
                json=json,
                timeout=timeout,
            )
    else:
        response = client.request(
            method,
            url,
            headers={"X-Internal-Token": settings.internal_token},
            params=params,
            json=json,
            timeout=timeout,
        )

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise InternalApiError(method, path, response.status_code, _extract_error_detail(response)) from exc

    return InternalApiResponse(
        status_code=response.status_code,
        payload=_decode_payload(response),
        text=(response.text or "").strip(),
    )


def report_job_status(name: str, status: str, message: Optional[str] = None) -> None:
    try:
        request_internal(
            "POST",
            f"/v1/admin/system-jobs/{name}",
            json={"status": status, "message": message},
            timeout=10.0,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("failed to report system job %s: %s", name, exc)
