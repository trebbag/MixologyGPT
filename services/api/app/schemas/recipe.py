import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.base import BaseSchema


class RecipeIngredient(BaseSchema):
    name: str
    quantity: float
    unit: str
    note: Optional[str] = None


class RecipeCreate(BaseModel):
    canonical_name: str
    description: Optional[str] = None
    ingredients: Optional[List[RecipeIngredient]] = None
    instructions: List[str]
    glassware_id: Optional[uuid.UUID] = None
    ice_style: Optional[str] = None
    tags: Optional[list[str]] = None


class RecipeRead(BaseSchema):
    id: uuid.UUID
    canonical_name: str
    description: Optional[str] = None
    ingredient_rows: Optional[List[RecipeIngredient]] = Field(default=None, serialization_alias="ingredients")
    instructions: List[str]
    glassware_id: Optional[uuid.UUID] = None
    ice_style: Optional[str] = None
    tags: Optional[list[str]] = None
    review_status: Optional[str] = None
    quality_label: Optional[str] = None


class RecipeSourceIngest(BaseModel):
    url: str
    source_type: str
    author: Optional[str] = None
    published_at: Optional[datetime] = None


class RecipeIngest(BaseModel):
    source: RecipeSourceIngest
    canonical_name: str
    description: Optional[str] = None
    ingredients: List[RecipeIngredient]
    instructions: List[str]
    glassware: Optional[str] = None
    ice_style: Optional[str] = None
    tags: Optional[List[str]] = None
    abv_estimate: Optional[float] = None
    rating_value: Optional[float] = None
    rating_count: Optional[int] = None
    like_count: Optional[int] = None
    share_count: Optional[int] = None


class RecipeHarvestRequest(BaseModel):
    source_url: str
    source_type: str
    raw_text: str
    canonical_name: Optional[str] = None
    author: Optional[str] = None
    rating_value: Optional[float] = None
    rating_count: Optional[int] = None
    like_count: Optional[int] = None
    share_count: Optional[int] = None


class RecipeHarvestResponse(BaseModel):
    status: str
    recipe_id: Optional[uuid.UUID]
    duplicate: bool
    quality_score: float


class RecipeHarvestJobCreate(BaseModel):
    source_url: str
    source_type: str
    raw_text: Optional[str] = None
    canonical_name: Optional[str] = None
    author: Optional[str] = None
    rating_value: Optional[float] = None
    rating_count: Optional[int] = None
    like_count: Optional[int] = None
    share_count: Optional[int] = None


class RecipeHarvestJobRead(BaseSchema):
    id: uuid.UUID
    user_id: uuid.UUID
    source_url: str
    source_type: str
    raw_text: str
    canonical_name: Optional[str] = None
    author: Optional[str] = None
    rating_value: Optional[float] = None
    rating_count: Optional[int] = None
    like_count: Optional[int] = None
    share_count: Optional[int] = None
    status: str
    error: Optional[str] = None
    attempt_count: Optional[int] = None
    last_attempt_at: Optional[datetime] = None
    next_retry_at: Optional[datetime] = None
    parse_strategy: Optional[str] = None
    compliance_reasons: Optional[list[str]] = None
    recipe_id: Optional[uuid.UUID] = None
    duplicate: Optional[bool] = None
    quality_score: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SourceDiscoveryRequest(BaseModel):
    urls: List[str]


class SourceDiscoveryResponse(BaseModel):
    allowed: List[str]
    blocked: List[dict]


class RecipeHarvestAutoRequest(BaseModel):
    source_url: str
    source_type: str = "web"
    max_links: int = 10
    max_pages: int = 40
    max_recipes: int = 20
    crawl_depth: int = 2
    respect_robots: bool = True
    enqueue: bool = True


class RecipeHarvestAutoResponse(BaseModel):
    status: str
    discovered_urls: List[str]
    parsed_count: int
    queued_job_ids: List[uuid.UUID]
    parser_stats: dict[str, int] = Field(default_factory=dict)
    confidence_buckets: dict[str, int] = Field(default_factory=dict)
    fallback_class_counts: dict[str, int] = Field(default_factory=dict)
    parse_failure_counts: dict[str, int] = Field(default_factory=dict)
    compliance_rejections: int = 0
    compliance_reason_counts: dict[str, int] = Field(default_factory=dict)
    skip_reason_counts: dict[str, int] = Field(default_factory=dict)
    errors: List[str] = []
