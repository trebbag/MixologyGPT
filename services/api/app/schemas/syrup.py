import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.base import BaseSchema


class SyrupRecipeCreate(BaseModel):
    name: str
    ratio: Optional[str] = None
    base_sugar: Optional[str] = None
    base_liquid: Optional[str] = None
    notes: Optional[str] = None


class SyrupRecipeRead(BaseSchema):
    id: uuid.UUID
    name: str
    ratio: Optional[str] = None
    base_sugar: Optional[str] = None
    base_liquid: Optional[str] = None
    notes: Optional[str] = None


class SyrupLotCreate(BaseModel):
    syrup_recipe_id: uuid.UUID
    inventory_item_id: uuid.UUID
    made_at: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    quantity: float
    unit: str


class SyrupLotRead(BaseSchema):
    id: uuid.UUID
    syrup_recipe_id: uuid.UUID
    inventory_item_id: uuid.UUID
    made_at: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    quantity: float
    unit: str


class SyrupMakerInput(BaseModel):
    lot_id: uuid.UUID
    quantity: float
    unit: str


class SyrupMakerExecuteRequest(SyrupLotCreate):
    inputs: Optional[list[SyrupMakerInput]] = None


class ExpiryRuleCreate(BaseModel):
    ingredient_id: Optional[uuid.UUID] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    days: float
    notes: Optional[str] = None


class ExpiryRuleRead(BaseSchema):
    id: uuid.UUID
    ingredient_id: Optional[uuid.UUID] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    days: float
    notes: Optional[str] = None
