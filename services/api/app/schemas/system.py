from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.base import BaseSchema


class SystemJobUpdate(BaseModel):
    status: str
    message: Optional[str] = None


class SystemJobRead(BaseSchema):
    id: str
    name: str
    last_run_at: Optional[datetime] = None
    last_status: Optional[str] = None
    last_message: Optional[str] = None
