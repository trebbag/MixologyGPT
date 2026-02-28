"""initial schema

Revision ID: 0001_initial
Revises: 
Create Date: 2026-02-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("role", sa.String(), nullable=False, server_default="user"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "ingredients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("canonical_name", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("subcategory", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("abv", sa.Float(), nullable=True),
        sa.Column("is_alcoholic", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_perishable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ingredients_canonical_name", "ingredients", ["canonical_name"], unique=True)

    op.create_table(
        "ingredient_aliases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("ingredient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ingredients.id"), nullable=False),
        sa.Column("alias", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ingredient_aliases_alias", "ingredient_aliases", ["alias"], unique=False)

    op.create_table(
        "ingredient_equivalencies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("ingredient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ingredients.id"), nullable=False),
        sa.Column("equivalent_ingredient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ingredients.id"), nullable=False),
        sa.Column("ratio", sa.Float(), nullable=False, server_default=sa.text("1.0")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "ingredient_embeddings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("ingredient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ingredients.id"), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("embedding", Vector(1536)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "inventory_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("ingredient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ingredients.id"), nullable=False),
        sa.Column("display_name", sa.String(), nullable=True),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column("preferred_unit", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_inventory_items_user_id", "inventory_items", ["user_id"], unique=False)
    op.create_index("ix_inventory_items_ingredient_id", "inventory_items", ["ingredient_id"], unique=False)

    op.create_table(
        "inventory_lots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("inventory_item_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inventory_items.id"), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column("abv", sa.Float(), nullable=True),
        sa.Column("purchase_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expiry_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("lot_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "inventory_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("inventory_item_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inventory_items.id"), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("delta_quantity", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("event_time", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "equipment",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_equipment_user_id", "equipment", ["user_id"], unique=False)

    op.create_table(
        "glassware",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=True),
        sa.Column("capacity_ml", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_glassware_user_id", "glassware", ["user_id"], unique=False)

    op.create_table(
        "syrup_recipes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("ratio", sa.String(), nullable=True),
        sa.Column("base_sugar", sa.String(), nullable=True),
        sa.Column("base_liquid", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "syrup_lots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("syrup_recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("syrup_recipes.id"), nullable=False),
        sa.Column("inventory_item_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inventory_items.id"), nullable=False),
        sa.Column("made_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expiry_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "expiry_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("ingredient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ingredients.id"), nullable=False),
        sa.Column("days", sa.Float(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "recipes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("canonical_name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("instructions", sa.JSON(), nullable=False),
        sa.Column("glassware_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("glassware.id"), nullable=True),
        sa.Column("ice_style", sa.String(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "recipe_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=False),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column("source_type", sa.String(), nullable=True),
        sa.Column("author", sa.String(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("credibility_score", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "recipe_variants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=False),
        sa.Column("variant_of_recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=True),
        sa.Column("similarity_score", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "recipe_badges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=False),
        sa.Column("badge_type", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "recipe_blurbs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=False),
        sa.Column("blurb", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "recipe_embeddings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("embedding", Vector(1536)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "studio_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "studio_constraints",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("studio_session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("studio_sessions.id"), nullable=False),
        sa.Column("constraints", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "studio_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("studio_session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("studio_sessions.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "studio_diffs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("studio_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("studio_versions.id"), nullable=False),
        sa.Column("diff", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "review_signals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("review_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reviews.id"), nullable=False),
        sa.Column("signal_type", sa.String(), nullable=False),
        sa.Column("value", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "fix_suggestions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("review_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reviews.id"), nullable=False),
        sa.Column("suggestions", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "tonight_flights",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "party_menus",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "batch_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("party_menu_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("party_menus.id"), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "media_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("deliver_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("media_assets")
    op.drop_table("batch_plans")
    op.drop_table("party_menus")
    op.drop_table("tonight_flights")
    op.drop_table("recommendations")
    op.drop_table("fix_suggestions")
    op.drop_table("review_signals")
    op.drop_table("reviews")
    op.drop_table("studio_diffs")
    op.drop_table("studio_versions")
    op.drop_table("studio_constraints")
    op.drop_table("studio_sessions")
    op.drop_table("recipe_embeddings")
    op.drop_table("recipe_blurbs")
    op.drop_table("recipe_badges")
    op.drop_table("recipe_variants")
    op.drop_table("recipe_sources")
    op.drop_table("recipes")
    op.drop_table("expiry_rules")
    op.drop_table("syrup_lots")
    op.drop_table("syrup_recipes")
    op.drop_table("glassware")
    op.drop_table("equipment")
    op.drop_table("inventory_events")
    op.drop_table("inventory_lots")
    op.drop_index("ix_inventory_items_ingredient_id", table_name="inventory_items")
    op.drop_index("ix_inventory_items_user_id", table_name="inventory_items")
    op.drop_table("inventory_items")
    op.drop_table("ingredient_embeddings")
    op.drop_table("ingredient_equivalencies")
    op.drop_index("ix_ingredient_aliases_alias", table_name="ingredient_aliases")
    op.drop_table("ingredient_aliases")
    op.drop_index("ix_ingredients_canonical_name", table_name="ingredients")
    op.drop_table("ingredients")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
