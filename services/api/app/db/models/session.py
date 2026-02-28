from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class RefreshSession(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "refresh_sessions"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    user_agent = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True, index=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    replaced_by_session_id = Column(UUID(as_uuid=True), ForeignKey("refresh_sessions.id"), nullable=True)
