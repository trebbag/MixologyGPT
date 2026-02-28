from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "BartenderAI"
    environment: str = "local"
    database_url: str = "postgresql+asyncpg://bartender:bartender@localhost:5433/bartenderai"
    redis_url: str = "redis://localhost:6380/0"
    jwt_secret: str = "dev-secret-change-me"
    jwt_lifetime_seconds: int = 3600
    refresh_lifetime_seconds: int = 60 * 60 * 24 * 30
    embeddings_provider: str = "openai"
    embeddings_model: str = "text-embedding-3-small"
    embeddings_dimensions: int = 1536
    llm_provider: str = "openai"
    llm_model: str = "chatgpt-5.2-thinking"
    llm_temperature: float = 0.3
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
    internal_token: str = "dev-internal"
    db_pool_size: int = 20
    db_max_overflow: int = 30
    db_pool_timeout_seconds: int = 30

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
