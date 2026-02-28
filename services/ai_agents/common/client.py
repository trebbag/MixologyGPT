from typing import Any

import httpx

from .config import settings


def post_json(path: str, payload: dict[str, Any], timeout: float = 30.0) -> dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    if settings.auth_token:
        headers["Authorization"] = f"Bearer {settings.auth_token}"
    with httpx.Client(timeout=timeout) as client:
        response = client.post(f"{settings.api_url}{path}", json=payload, headers=headers)
    response.raise_for_status()
    body = response.json()
    if not isinstance(body, dict):
        raise ValueError("Agent endpoint returned a non-object JSON payload")
    return body
