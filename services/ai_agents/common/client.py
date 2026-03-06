from typing import Any

import httpx

from .config import settings


def _build_url(path: str) -> str:
    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"{settings.api_url.rstrip('/')}{normalized_path}"


def post_json(path: str, payload: dict[str, Any], timeout: float = 30.0) -> dict[str, Any]:
    settings.validate_runtime()
    headers = {"Content-Type": "application/json"}
    if settings.auth_token and settings.auth_token.strip():
        headers["Authorization"] = f"Bearer {settings.auth_token.strip()}"
    with httpx.Client(timeout=timeout) as client:
        response = client.post(_build_url(path), json=payload, headers=headers)
    response.raise_for_status()
    body = response.json()
    if not isinstance(body, dict):
        raise ValueError("Agent endpoint returned a non-object JSON payload")
    return body
