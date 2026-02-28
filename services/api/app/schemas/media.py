import uuid
from typing import Any, Optional

from pydantic import BaseModel, Field, constr

from app.schemas.base import BaseSchema


class MediaAssetCreate(BaseModel):
    url: str
    media_type: str
    metadata: Optional[dict[str, Any]] = None


class MediaAssetRead(BaseSchema):
    id: uuid.UUID
    owner_id: uuid.UUID
    url: str
    media_type: str
    metadata: Optional[dict[str, Any]] = Field(default=None, validation_alias="metadata_json", serialization_alias="metadata")


class MediaUploadRequest(BaseModel):
    filename: constr(min_length=1)
    content_type: constr(min_length=1)
    data_base64: constr(min_length=8)
    media_type: str = "image"
