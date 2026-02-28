from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://bartender:bartender@localhost:5432/bartenderai"
    redis_url: str = "redis://localhost:6379/0"
    api_url: str = "http://localhost:8000"
    internal_token: str = "dev-internal"
    environment: str = "local"

    # Periodic alert-threshold calibration is intended for staging to keep per-domain
    # alert settings representative as crawl volume shifts.
    enable_alert_calibration: bool = False
    alert_calibration_interval_seconds: int = 60 * 60 * 6
    alert_calibration_min_jobs: int = 20
    alert_calibration_buffer_multiplier: float = 1.25

    class Config:
        env_file = ".env"


settings = Settings()
