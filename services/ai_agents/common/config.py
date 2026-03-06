from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_API_URL = "http://localhost:8000"
LOCAL_ENVIRONMENTS = {"local", "development", "dev", "test"}


class Settings(BaseSettings):
    api_url: str = DEFAULT_API_URL
    auth_token: Optional[str] = None
    environment: str = "local"

    model_config = SettingsConfigDict(env_file=".env")

    def is_local_environment(self) -> bool:
        return (self.environment or "local").strip().lower() in LOCAL_ENVIRONMENTS

    def validate_runtime(self) -> None:
        if self.is_local_environment():
            return

        issues: list[str] = []
        if self.api_url.rstrip("/") == DEFAULT_API_URL:
            issues.append("API_URL must be set to a non-local value outside local development.")
        if not (self.auth_token or "").strip():
            issues.append("AUTH_TOKEN must be set outside local development.")

        if issues:
            raise RuntimeError("Invalid AI agent runtime configuration: " + " ".join(issues))


settings = Settings()
