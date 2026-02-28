from sqlalchemy import Column, DateTime, Float, ForeignKey, JSON, String, Text, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class Recipe(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recipes"

    canonical_name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    ingredients = Column(JSON, nullable=True)
    instructions = Column(JSON, nullable=False)
    glassware_id = Column(UUID(as_uuid=True), ForeignKey("glassware.id"), nullable=True)
    ice_style = Column(String, nullable=True)
    tags = Column(JSON, nullable=True)
    review_status = Column(String, nullable=False, default="unreviewed")
    quality_label = Column(String, nullable=True)

    ingredient_rows = relationship("RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan")


class RecipeSource(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recipe_sources"

    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=False)
    url = Column(String, nullable=True)
    source_type = Column(String, nullable=True)
    author = Column(String, nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    credibility_score = Column(Float, nullable=True)


class RecipeSourcePolicy(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recipe_source_policies"

    name = Column(String, nullable=False)
    domain = Column(String, nullable=False, unique=True, index=True)
    metric_type = Column(String, nullable=False, default="ratings")
    min_rating_count = Column(Integer, nullable=False, default=0)
    min_rating_value = Column(Float, nullable=False, default=0.0)
    review_policy = Column(String, nullable=False, default="manual")
    is_active = Column(Boolean, nullable=False, default=True)
    seed_urls = Column(JSON, nullable=False, default=list)
    crawl_depth = Column(Integer, nullable=False, default=2)
    max_pages = Column(Integer, nullable=False, default=40)
    max_recipes = Column(Integer, nullable=False, default=20)
    crawl_interval_minutes = Column(Integer, nullable=False, default=240)
    respect_robots = Column(Boolean, nullable=False, default=True)
    parser_settings = Column(JSON, nullable=False, default=dict)
    alert_settings = Column(JSON, nullable=False, default=dict)


class RecipeHarvestJob(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recipe_harvest_jobs"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    source_url = Column(String, nullable=False)
    source_type = Column(String, nullable=False)
    raw_text = Column(Text, nullable=True)
    canonical_name = Column(String, nullable=True)
    author = Column(String, nullable=True)
    rating_value = Column(Float, nullable=True)
    rating_count = Column(Integer, nullable=True)
    like_count = Column(Integer, nullable=True)
    share_count = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="pending")
    error = Column(Text, nullable=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    last_attempt_at = Column(DateTime(timezone=True), nullable=True)
    next_retry_at = Column(DateTime(timezone=True), nullable=True)
    parse_strategy = Column(String, nullable=True)
    compliance_reasons = Column(JSON, nullable=True)
    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=True)
    duplicate = Column(Boolean, nullable=True)
    quality_score = Column(Float, nullable=True)


class RecipeVariant(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recipe_variants"

    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=False)
    variant_of_recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=True)
    similarity_score = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)


class RecipeBadge(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recipe_badges"

    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=False)
    badge_type = Column(String, nullable=False)
    label = Column(String, nullable=False)


class RecipeBlurb(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recipe_blurbs"

    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=False)
    blurb = Column(Text, nullable=False)


class RecipeEmbedding(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recipe_embeddings"

    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=False)
    model = Column(String, nullable=False)
    embedding = Column(Vector(1536), nullable=True)


class RecipeIngredient(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "recipe_ingredients"

    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    note = Column(Text, nullable=True)

    recipe = relationship("Recipe", back_populates="ingredient_rows")
