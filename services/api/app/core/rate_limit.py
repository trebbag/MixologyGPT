import hashlib
from typing import Optional

from jose import JWTError, jwt
from slowapi import Limiter
from starlette.requests import Request
from slowapi.util import get_remote_address

from app.core.config import settings


def _auth_subject(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], options={"verify_aud": False})
    except JWTError:
        return None
    subject = payload.get("sub")
    if isinstance(subject, str) and subject:
        return f"user:{subject}"
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]
    return f"token:{token_hash}"


def rate_limit_key(request: Request) -> str:
    internal_token = request.headers.get("X-Internal-Token", "")
    if internal_token and internal_token == settings.internal_token:
        return "internal:trusted"
    subject = _auth_subject(request)
    if subject:
        return subject
    return get_remote_address(request)


limiter = Limiter(
    key_func=rate_limit_key,
    default_limits=[f"{settings.rate_limit_per_minute}/minute"],
)
