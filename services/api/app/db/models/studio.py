from sqlalchemy import Column, DateTime, ForeignKey, JSON, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class StudioSession(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "studio_sessions"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="active")
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)


class StudioConstraint(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "studio_constraints"

    studio_session_id = Column(UUID(as_uuid=True), ForeignKey("studio_sessions.id"), nullable=False)
    constraints = Column(JSON, nullable=False)


class StudioVersion(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "studio_versions"

    studio_session_id = Column(UUID(as_uuid=True), ForeignKey("studio_sessions.id"), nullable=False)
    version = Column(Integer, nullable=False)
    snapshot = Column(JSON, nullable=False)


class StudioDiff(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "studio_diffs"

    studio_version_id = Column(UUID(as_uuid=True), ForeignKey("studio_versions.id"), nullable=False)
    diff = Column(JSON, nullable=False)


class StudioPrompt(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "studio_prompts"

    studio_session_id = Column(UUID(as_uuid=True), ForeignKey("studio_sessions.id"), nullable=False, index=True)
    role = Column(String, nullable=False, default="user")
    prompt_type = Column(String, nullable=False, default="note")
    content = Column(Text, nullable=False)


class StudioShare(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "studio_shares"

    studio_session_id = Column(UUID(as_uuid=True), ForeignKey("studio_sessions.id"), nullable=False, index=True)
    slug = Column(String, nullable=False, unique=True, index=True)
    payload = Column(JSON, nullable=False)
