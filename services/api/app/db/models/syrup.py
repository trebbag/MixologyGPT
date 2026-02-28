from sqlalchemy import Column, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class SyrupRecipe(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "syrup_recipes"

    name = Column(String, nullable=False)
    ratio = Column(String, nullable=True)
    base_sugar = Column(String, nullable=True)
    base_liquid = Column(String, nullable=True)
    notes = Column(Text, nullable=True)


class SyrupLot(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "syrup_lots"

    syrup_recipe_id = Column(UUID(as_uuid=True), ForeignKey("syrup_recipes.id"), nullable=False)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False)
    made_at = Column(DateTime(timezone=True), nullable=True)
    expiry_date = Column(DateTime(timezone=True), nullable=True)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)


class ExpiryRule(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "expiry_rules"

    ingredient_id = Column(UUID(as_uuid=True), ForeignKey("ingredients.id"), nullable=True)
    category = Column(String, nullable=True)
    subcategory = Column(String, nullable=True)
    days = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)
