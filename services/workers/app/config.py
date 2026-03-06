from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DATABASE_URL = "postgresql+asyncpg://bartender:bartender@localhost:5432/bartenderai"
DEFAULT_REDIS_URL = "redis://localhost:6379/0"
DEFAULT_API_URL = "http://localhost:8000"
DEFAULT_INTERNAL_TOKEN = "dev-internal"
LOCAL_ENVIRONMENTS = {"local", "development", "dev", "test"}


class Settings(BaseSettings):
    database_url: str = DEFAULT_DATABASE_URL
    redis_url: str = DEFAULT_REDIS_URL
    api_url: str = DEFAULT_API_URL
    internal_token: str = DEFAULT_INTERNAL_TOKEN
    environment: str = "local"
    cocktaildb_api_key: str = ""
    cocktaildb_api_base_url: str = "https://www.thecocktaildb.com/api/json/v1"
    cocktaildb_request_timeout_seconds: int = 15

    # Periodic alert-threshold calibration is intended for staging to keep per-domain
    # alert settings representative as crawl volume shifts.
    enable_alert_calibration: bool = False
    alert_calibration_interval_seconds: int = 60 * 60 * 6
    alert_calibration_min_jobs: int = 20
    alert_calibration_buffer_multiplier: float = 1.25

    model_config = SettingsConfigDict(env_file=".env")

    def is_local_environment(self) -> bool:
        return (self.environment or "local").strip().lower() in LOCAL_ENVIRONMENTS

    def validate_runtime(self) -> None:
        if self.is_local_environment():
            return

        issues: list[str] = []
        if self.api_url.rstrip("/") == DEFAULT_API_URL:
            issues.append("API_URL must be set to a non-local value outside local development.")
        if self.internal_token == DEFAULT_INTERNAL_TOKEN:
            issues.append("INTERNAL_TOKEN must be set to a non-default value outside local development.")

        if issues:
            raise RuntimeError("Invalid worker runtime configuration: " + " ".join(issues))


settings = Settings()
