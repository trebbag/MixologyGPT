import json
from typing import Any, Optional

from pydantic import field_validator

from pydantic_settings import BaseSettings, DotEnvSettingsSource, EnvSettingsSource, SettingsConfigDict

DEFAULT_DATABASE_URL = "postgresql+asyncpg://bartender:bartender@localhost:5433/bartenderai"
DEFAULT_REDIS_URL = "redis://localhost:6380/0"
DEFAULT_JWT_SECRET = "dev-secret-change-me"
DEFAULT_INTERNAL_TOKEN = "dev-internal"
LOCAL_CORS_ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
LOCAL_ENVIRONMENTS = {"local", "development", "dev", "test"}


class _CorsOriginParserMixin:
    def prepare_field_value(self, field_name: str, field: Any, value: Any, value_is_complex: bool) -> Any:
        if field_name == "cors_allowed_origins" and isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            if stripped.startswith("["):
                try:
                    parsed = json.loads(stripped)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return super().prepare_field_value(field_name, field, value, value_is_complex)


class CorsAwareEnvSettingsSource(_CorsOriginParserMixin, EnvSettingsSource):
    pass


class CorsAwareDotEnvSettingsSource(_CorsOriginParserMixin, DotEnvSettingsSource):
    pass


class Settings(BaseSettings):
    app_name: str = "BartenderAI"
    environment: str = "local"
    database_url: str = DEFAULT_DATABASE_URL
    redis_url: str = DEFAULT_REDIS_URL
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_lifetime_seconds: int = 3600
    refresh_lifetime_seconds: int = 60 * 60 * 24 * 30
    embeddings_provider: str = "openai"
    embeddings_model: str = "text-embedding-3-small"
    embeddings_dimensions: int = 1536
    llm_provider: str = "openai"
    llm_model: str = "chatgpt-5.2-thinking"
    llm_temperature: float = 0.3
    cocktaildb_api_key: str = ""
    cocktaildb_api_base_url: str = "https://www.thecocktaildb.com/api/json/v1"
    cocktaildb_request_timeout_seconds: int = 15
    otlp_endpoint: Optional[str] = None
    enable_metrics: bool = True
    rate_limit_per_minute: int = 60
    rate_limit_ingest_per_minute: int = 20
    rate_limit_harvest_per_minute: int = 10
    rate_limit_auto_harvest_per_minute: int = 180
    rate_limit_agent_inventory_per_minute: int = 5
    rate_limit_agent_harvest_per_minute: int = 10
    rate_limit_agent_mixology_per_minute: int = 20
    rate_limit_agent_balance_per_minute: int = 30
    expiry_window_days: int = 7
    low_stock_threshold: float = 1.0
    harvest_max_attempts: int = 3
    harvest_retry_base_seconds: int = 300
    harvest_retry_max_seconds: int = 3600
    internal_token: str = DEFAULT_INTERNAL_TOKEN
    db_pool_size: int = 20
    db_max_overflow: int = 30
    db_pool_timeout_seconds: int = 30
    cors_allowed_origins: list[str] = list(LOCAL_CORS_ALLOWED_ORIGINS)

    model_config = SettingsConfigDict(env_file=".env")

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings,
        env_settings,
        dotenv_settings,
        file_secret_settings,
    ):
        return (
            init_settings,
            CorsAwareEnvSettingsSource(settings_cls),
            CorsAwareDotEnvSettingsSource(
                settings_cls,
                env_file=settings_cls.model_config.get("env_file"),
                env_file_encoding=settings_cls.model_config.get("env_file_encoding"),
            ),
            file_secret_settings,
        )

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _parse_cors_allowed_origins(cls, value: Any) -> list[str]:
        if value is None:
            return list(LOCAL_CORS_ALLOWED_ORIGINS)
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            if stripped.startswith("["):
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            return [item.strip() for item in stripped.split(",") if item.strip()]
        if isinstance(value, (list, tuple, set)):
            return [str(item).strip() for item in value if str(item).strip()]
        raise TypeError("cors_allowed_origins must be a string or list")

    def is_local_environment(self) -> bool:
        return (self.environment or "local").strip().lower() in LOCAL_ENVIRONMENTS

    def validate_runtime(self) -> None:
        if self.is_local_environment():
            return

        issues: list[str] = []
        if self.jwt_secret == DEFAULT_JWT_SECRET:
            issues.append("JWT_SECRET must be set to a non-default value outside local development.")
        if self.internal_token == DEFAULT_INTERNAL_TOKEN:
            issues.append("INTERNAL_TOKEN must be set to a non-default value outside local development.")
        if not self.cors_allowed_origins:
            issues.append("CORS_ALLOWED_ORIGINS must include at least one trusted origin outside local development.")
        if "*" in self.cors_allowed_origins:
            issues.append("CORS_ALLOWED_ORIGINS cannot include '*' outside local development.")

        if issues:
            raise RuntimeError("Invalid runtime configuration: " + " ".join(issues))

settings = Settings()
