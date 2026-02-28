import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.base import BaseSchema


class InventoryItemCreate(BaseModel):
    ingredient_id: uuid.UUID
    display_name: Optional[str] = None
    unit: str
    preferred_unit: Optional[str] = None
    unit_to_ml: Optional[float] = None


class InventoryItemUpdate(BaseModel):
    display_name: Optional[str] = None
    unit: Optional[str] = None
    preferred_unit: Optional[str] = None
    unit_to_ml: Optional[float] = None


class InventoryItemRead(BaseSchema):
    id: uuid.UUID
    user_id: uuid.UUID
    ingredient_id: uuid.UUID
    display_name: Optional[str] = None
    unit: str
    preferred_unit: Optional[str] = None
    unit_to_ml: Optional[float] = None


class InventoryLotCreate(BaseModel):
    inventory_item_id: uuid.UUID
    quantity: float
    unit: str
    abv: Optional[float] = None
    purchase_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    location: Optional[str] = None
    lot_notes: Optional[str] = None


class InventoryLotUpdate(BaseModel):
    quantity: Optional[float] = None
    unit: Optional[str] = None
    abv: Optional[float] = None
    purchase_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    location: Optional[str] = None
    lot_notes: Optional[str] = None


class InventoryLotRead(BaseSchema):
    id: uuid.UUID
    inventory_item_id: uuid.UUID
    quantity: float
    unit: str
    abv: Optional[float] = None
    purchase_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    location: Optional[str] = None
    lot_notes: Optional[str] = None


class InventoryEventCreate(BaseModel):
    lot_id: Optional[uuid.UUID] = None
    inventory_item_id: Optional[uuid.UUID] = None
    event_type: str
    quantity: float
    unit: str
    note: Optional[str] = None
    event_time: Optional[datetime] = None


class InventoryEventRead(BaseSchema):
    id: uuid.UUID
    inventory_item_id: uuid.UUID
    event_type: str
    delta_quantity: float
    unit: str
    note: Optional[str] = None
    event_time: datetime
