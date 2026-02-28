from sqlalchemy import Column, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class Review(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "reviews"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=False)
    rating = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)


class ReviewSignal(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "review_signals"

    review_id = Column(UUID(as_uuid=True), ForeignKey("reviews.id"), nullable=False)
    signal_type = Column(String, nullable=False)
    value = Column(String, nullable=False)


class FixSuggestion(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "fix_suggestions"

    review_id = Column(UUID(as_uuid=True), ForeignKey("reviews.id"), nullable=False)
    suggestions = Column(JSON, nullable=False)


class RecipeModeration(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recipe_moderations"

    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=False)
    reviewer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(String, nullable=False, default="pending")
    quality_label = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    overrides = Column(JSON, nullable=True)
