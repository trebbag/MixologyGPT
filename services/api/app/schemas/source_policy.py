import re
import uuid
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RecipeSourcePolicyBase(BaseModel):
    name: str
    domain: str
    metric_type: Literal["ratings", "pervasiveness"]
    min_rating_count: int = 0
    min_rating_value: float = 0.0
    review_policy: Literal["manual", "auto"] = "manual"
    is_active: bool = True
    seed_urls: list[str] = Field(default_factory=list)
    crawl_depth: int = 2
    max_pages: int = 40
    max_recipes: int = 20
    crawl_interval_minutes: int = 240
    respect_robots: bool = True
    parser_settings: dict[str, Any] = Field(default_factory=dict)
    alert_settings: dict[str, Any] = Field(default_factory=dict)

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, value: str) -> str:
        domain = value.strip().lower()
        if domain.startswith("http://") or domain.startswith("https://"):
            raise ValueError("domain must not include protocol")
        if "/" in domain:
            raise ValueError("domain must be a hostname only")
        if not re.match(r"^[a-z0-9.-]+$", domain):
            raise ValueError("invalid domain format")
        return domain

    @field_validator("seed_urls")
    @classmethod
    def validate_seed_urls(cls, value: list[str]) -> list[str]:
        cleaned = []
        for url in value:
            url = url.strip()
            if not url:
                continue
            if not (url.startswith("http://") or url.startswith("https://")):
                raise ValueError("seed_urls must include http or https urls")
            cleaned.append(url)
        return cleaned

    @field_validator("parser_settings", "alert_settings")
    @classmethod
    def validate_settings_dict(cls, value: dict[str, Any]) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}


class RecipeSourcePolicyCreate(RecipeSourcePolicyBase):
    pass


class RecipeSourcePolicyUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    metric_type: Optional[Literal["ratings", "pervasiveness"]] = None
    min_rating_count: Optional[int] = None
    min_rating_value: Optional[float] = None
    review_policy: Optional[Literal["manual", "auto"]] = None
    is_active: Optional[bool] = None
    seed_urls: Optional[list[str]] = None
    crawl_depth: Optional[int] = None
    max_pages: Optional[int] = None
    max_recipes: Optional[int] = None
    crawl_interval_minutes: Optional[int] = None
    respect_robots: Optional[bool] = None
    parser_settings: Optional[dict[str, Any]] = None
    alert_settings: Optional[dict[str, Any]] = None

    @field_validator("domain")
    @classmethod
    def validate_optional_domain(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        domain = value.strip().lower()
        if domain.startswith("http://") or domain.startswith("https://"):
            raise ValueError("domain must not include protocol")
        if "/" in domain:
            raise ValueError("domain must be a hostname only")
        if not re.match(r"^[a-z0-9.-]+$", domain):
            raise ValueError("invalid domain format")
        return domain

    @field_validator("seed_urls")
    @classmethod
    def validate_optional_seed_urls(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if value is None:
            return None
        cleaned = []
        for url in value:
            url = url.strip()
            if not url:
                continue
            if not (url.startswith("http://") or url.startswith("https://")):
                raise ValueError("seed_urls must include http or https urls")
            cleaned.append(url)
        return cleaned

    @field_validator("parser_settings", "alert_settings")
    @classmethod
    def validate_optional_settings_dict(
        cls, value: Optional[dict[str, Any]]
    ) -> Optional[dict[str, Any]]:
        if value is None:
            return None
        return value if isinstance(value, dict) else {}


class RecipeSourcePolicyRead(RecipeSourcePolicyBase):
    id: uuid.UUID

    model_config = ConfigDict(from_attributes=True)


class ParserRecoverySuggestionRequest(BaseModel):
    parse_failure: str
    source_url: Optional[str] = None

    @field_validator("parse_failure")
    @classmethod
    def validate_parse_failure(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise ValueError("parse_failure is required")
        return cleaned

    @field_validator("source_url")
    @classmethod
    def validate_source_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        if not (cleaned.startswith("http://") or cleaned.startswith("https://")):
            raise ValueError("source_url must include http or https")
        return cleaned


class ParserRecoverySuggestionResponse(BaseModel):
    policy_id: uuid.UUID
    domain: str
    parse_failure: str
    source_url: str
    actions: list[str]
    changed_keys: list[str]
    patch: dict[str, Any]
    applied: bool
