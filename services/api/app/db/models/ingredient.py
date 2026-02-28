from sqlalchemy import Boolean, Column, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class Ingredient(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ingredients"

    canonical_name = Column(String, nullable=False, unique=True, index=True)
    category = Column(String, nullable=True)
    subcategory = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    abv = Column(Float, nullable=True)
    is_alcoholic = Column(Boolean, default=False, nullable=False)
    is_perishable = Column(Boolean, default=False, nullable=False)

    aliases = relationship("IngredientAlias", back_populates="ingredient", cascade="all, delete-orphan")


class IngredientAlias(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ingredient_aliases"

    ingredient_id = Column(UUID(as_uuid=True), ForeignKey("ingredients.id"), nullable=False)
    alias = Column(String, nullable=False, index=True)

    ingredient = relationship("Ingredient", back_populates="aliases")


class IngredientEquivalency(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ingredient_equivalencies"

    ingredient_id = Column(UUID(as_uuid=True), ForeignKey("ingredients.id"), nullable=False)
    equivalent_ingredient_id = Column(UUID(as_uuid=True), ForeignKey("ingredients.id"), nullable=False)
    ratio = Column(Float, nullable=False, default=1.0)
    notes = Column(Text, nullable=True)


class IngredientEmbedding(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ingredient_embeddings"

    ingredient_id = Column(UUID(as_uuid=True), ForeignKey("ingredients.id"), nullable=False)
    model = Column(String, nullable=False)
    embedding = Column(Vector(1536), nullable=True)
