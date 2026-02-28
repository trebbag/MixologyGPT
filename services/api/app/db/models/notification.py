from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class Notification(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notifications"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)
    payload = Column(JSON, nullable=True)
    status = Column(String, nullable=False, default="pending")
    deliver_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
