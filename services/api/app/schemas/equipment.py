import uuid
from typing import Optional

from pydantic import BaseModel

from app.schemas.base import BaseSchema


class EquipmentCreate(BaseModel):
    name: str
    type: Optional[str] = None
    notes: Optional[str] = None


class EquipmentRead(BaseSchema):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    type: Optional[str] = None
    notes: Optional[str] = None


class GlasswareCreate(BaseModel):
    name: str
    type: Optional[str] = None
    capacity_ml: Optional[float] = None
    notes: Optional[str] = None


class GlasswareRead(BaseSchema):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    type: Optional[str] = None
    capacity_ml: Optional[float] = None
    notes: Optional[str] = None
