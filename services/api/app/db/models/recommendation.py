from sqlalchemy import Column, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class Recommendation(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recommendations"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)
    payload = Column(JSON, nullable=False)


class TonightFlight(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "tonight_flights"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    payload = Column(JSON, nullable=False)


class PartyMenu(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "party_menus"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    payload = Column(JSON, nullable=False)


class BatchPlan(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "batch_plans"

    party_menu_id = Column(UUID(as_uuid=True), ForeignKey("party_menus.id"), nullable=False)
    payload = Column(JSON, nullable=False)
