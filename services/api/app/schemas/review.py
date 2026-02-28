import uuid
from typing import Any, Optional

from pydantic import BaseModel, conint

from app.schemas.base import BaseSchema


class ReviewCreate(BaseModel):
    recipe_id: uuid.UUID
    rating: conint(ge=1, le=5)
    notes: Optional[str] = None
    signals: Optional[list[dict[str, str]]] = None


class ReviewRead(BaseSchema):
    id: uuid.UUID
    user_id: uuid.UUID
    recipe_id: uuid.UUID
    rating: int
    notes: Optional[str] = None


class RecipeModerationCreate(BaseModel):
    status: str = "pending"
    quality_label: Optional[str] = None
    notes: Optional[str] = None
    overrides: Optional[dict[str, Any]] = None


class RecipeModerationUpdate(BaseModel):
    status: Optional[str] = None
    quality_label: Optional[str] = None
    notes: Optional[str] = None
    overrides: Optional[dict[str, Any]] = None


class RecipeModerationRead(BaseSchema):
    id: uuid.UUID
    recipe_id: uuid.UUID
    reviewer_id: uuid.UUID
    status: str
    quality_label: Optional[str] = None
    notes: Optional[str] = None
    overrides: Optional[dict[str, Any]] = None
