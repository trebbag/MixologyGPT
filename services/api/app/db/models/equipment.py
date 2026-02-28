from sqlalchemy import Column, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class Equipment(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "equipment"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=True)
    notes = Column(Text, nullable=True)


class Glassware(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "glassware"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=True)
    capacity_ml = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
