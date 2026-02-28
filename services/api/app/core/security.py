import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy

from app.core.config import settings


bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=settings.jwt_secret, lifetime_seconds=settings.jwt_lifetime_seconds)


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def refresh_expires_at() -> datetime:
    return utcnow() + timedelta(seconds=settings.refresh_lifetime_seconds)


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(64)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
