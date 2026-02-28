import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from app.schemas.base import BaseSchema


class NotificationCreate(BaseModel):
    type: str
    payload: Optional[dict[str, Any]] = None
    status: Optional[str] = "pending"
    deliver_at: Optional[datetime] = None


class NotificationRead(BaseSchema):
    id: uuid.UUID
    user_id: uuid.UUID
    type: str
    payload: Optional[dict[str, Any]] = None
    status: str
    deliver_at: datetime


class NotificationUpdate(BaseModel):
    status: Optional[str] = None
