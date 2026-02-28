from jose import jwt
from starlette.requests import Request
from typing import List, Optional, Tuple

from app.core.config import settings
from app.core.rate_limit import rate_limit_key


def _request(headers: Optional[List[Tuple[bytes, bytes]]] = None, client_ip: str = "127.0.0.1") -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/v1/recipes/harvest/auto",
        "headers": headers or [],
        "query_string": b"",
        "client": (client_ip, 12345),
        "server": ("testserver", 80),
        "scheme": "http",
        "http_version": "1.1",
    }
    return Request(scope)


def test_rate_limit_key_prefers_internal_token():
    request = _request(headers=[(b"x-internal-token", settings.internal_token.encode("utf-8"))], client_ip="10.0.0.1")
    assert rate_limit_key(request) == "internal:trusted"


def test_rate_limit_key_prefers_authenticated_subject():
    token = jwt.encode({"sub": "user-123"}, settings.jwt_secret, algorithm="HS256")
    request = _request(headers=[(b"authorization", f"Bearer {token}".encode("utf-8"))], client_ip="10.0.0.2")
    assert rate_limit_key(request) == "user:user-123"


def test_rate_limit_key_falls_back_to_remote_address_when_token_invalid():
    request = _request(headers=[(b"authorization", b"Bearer invalid-token")], client_ip="10.0.0.3")
    assert rate_limit_key(request) == "10.0.0.3"


def test_rate_limit_key_falls_back_to_remote_address_for_unauthenticated_requests():
    request = _request(client_ip="10.0.0.4")
    assert rate_limit_key(request) == "10.0.0.4"
