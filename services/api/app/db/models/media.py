from sqlalchemy import Column, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class MediaAsset(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "media_assets"

    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    url = Column(String, nullable=False)
    media_type = Column(String, nullable=False)
    metadata_json = Column("metadata", JSON, nullable=True)
