import uuid
from typing import Any, Optional

from pydantic import BaseModel

from app.schemas.base import BaseSchema


class RecommendationCreate(BaseModel):
    type: str
    payload: dict[str, Any]


class RecommendationRead(BaseSchema):
    id: uuid.UUID
    user_id: uuid.UUID
    type: str
    payload: dict[str, Any]


class TonightFlightCreate(BaseModel):
    payload: dict[str, Any]


class TonightFlightRead(BaseSchema):
    id: uuid.UUID
    user_id: uuid.UUID
    payload: dict[str, Any]


class PartyMenuCreate(BaseModel):
    payload: dict[str, Any]


class PartyMenuRead(BaseSchema):
    id: uuid.UUID
    user_id: uuid.UUID
    payload: dict[str, Any]


class BatchPlanCreate(BaseModel):
    party_menu_id: uuid.UUID
    payload: dict[str, Any]


class BatchPlanRead(BaseSchema):
    id: uuid.UUID
    party_menu_id: uuid.UUID
    payload: dict[str, Any]


class PartyMenuGenerateRequest(BaseModel):
    recipe_ids: list[uuid.UUID]
    guest_count: int
    servings_per_guest: int = 1
    dilution: float = 0.2
    reserve_oz: float = 1.0
    servings_by_recipe: Optional[dict[uuid.UUID, int]] = None


class PartyMenuGenerateResponse(BaseModel):
    shopping_list: list[dict[str, Any]]
    missing: list[dict[str, Any]]
    batch_plan: list[dict[str, Any]]


class UnlockScoreSuggestion(BaseModel):
    ingredient: str
    unlock_count: float


class UnlockScoreResponse(BaseModel):
    unlock_score: float
    make_now_count: int
    missing_one_count: int
    total_recipes: int
    suggestions: list[UnlockScoreSuggestion]
