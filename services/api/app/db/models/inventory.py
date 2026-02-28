from sqlalchemy import Column, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class InventoryItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "inventory_items"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    ingredient_id = Column(UUID(as_uuid=True), ForeignKey("ingredients.id"), nullable=False, index=True)
    display_name = Column(String, nullable=True)
    unit = Column(String, nullable=False)
    preferred_unit = Column(String, nullable=True)
    unit_to_ml = Column(Float, nullable=True)

    lots = relationship("InventoryLot", back_populates="inventory_item", cascade="all, delete-orphan")


class InventoryLot(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "inventory_lots"

    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    abv = Column(Float, nullable=True)
    purchase_date = Column(DateTime(timezone=True), nullable=True)
    expiry_date = Column(DateTime(timezone=True), nullable=True)
    location = Column(String, nullable=True)
    lot_notes = Column(Text, nullable=True)

    inventory_item = relationship("InventoryItem", back_populates="lots")


class InventoryEvent(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "inventory_events"

    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False)
    event_type = Column(String, nullable=False)
    delta_quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    note = Column(Text, nullable=True)
    event_time = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
