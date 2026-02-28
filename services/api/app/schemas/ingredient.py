import uuid
from typing import Optional

from pydantic import BaseModel

from app.schemas.base import BaseSchema


class IngredientCreate(BaseModel):
    canonical_name: str
    category: Optional[str] = None
    subcategory: Optional[str] = None
    description: Optional[str] = None
    abv: Optional[float] = None
    is_alcoholic: bool = False
    is_perishable: bool = False


class IngredientRead(BaseSchema):
    id: uuid.UUID
    canonical_name: str
    category: Optional[str] = None
    subcategory: Optional[str] = None
    description: Optional[str] = None
    abv: Optional[float] = None
    is_alcoholic: bool
    is_perishable: bool


class IngredientUpdate(BaseModel):
    canonical_name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    description: Optional[str] = None
    abv: Optional[float] = None
    is_alcoholic: Optional[bool] = None
    is_perishable: Optional[bool] = None


class IngredientEquivalencyCreate(BaseModel):
    ingredient_id: uuid.UUID
    equivalent_ingredient_id: uuid.UUID
    ratio: float = 1.0
    notes: Optional[str] = None


class IngredientEquivalencyRead(BaseSchema):
    id: uuid.UUID
    ingredient_id: uuid.UUID
    equivalent_ingredient_id: uuid.UUID
    ratio: float
    notes: Optional[str] = None
