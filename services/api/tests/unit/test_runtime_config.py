from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
import pytest

from app.core.config import Settings


def _build_cors_app(origins: list[str]) -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def _health() -> dict[str, str]:
        return {"status": "ok"}

    return app


def test_validate_runtime_allows_local_defaults():
    settings = Settings()
    settings.validate_runtime()


def test_validate_runtime_rejects_non_local_defaults():
    settings = Settings(
        environment="staging",
        jwt_secret="dev-secret-change-me",
        internal_token="dev-internal",
        cors_allowed_origins="https://app.example.com",
    )
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        settings.validate_runtime()


def test_cors_allowed_origins_parses_csv_values():
    settings = Settings(cors_allowed_origins="https://app.example.com, https://admin.example.com")
    assert settings.cors_allowed_origins == ["https://app.example.com", "https://admin.example.com"]


def test_cors_allowed_origins_parses_csv_env_values(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://app.example.com, https://admin.example.com")
    settings = Settings()
    assert settings.cors_allowed_origins == ["https://app.example.com", "https://admin.example.com"]


def test_cors_allowed_origins_parses_json_env_values(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", '["https://app.example.com", "https://admin.example.com"]')
    settings = Settings()
    assert settings.cors_allowed_origins == ["https://app.example.com", "https://admin.example.com"]


def test_cors_allows_configured_origin_and_rejects_unknown_origin():
    app = _build_cors_app(["https://app.example.com"])
    client = TestClient(app)

    allowed = client.options(
        "/health",
        headers={
            "Origin": "https://app.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert allowed.status_code == 200
    assert allowed.headers.get("access-control-allow-origin") == "https://app.example.com"

    rejected = client.options(
        "/health",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert rejected.status_code == 400
    assert rejected.headers.get("access-control-allow-origin") is None
