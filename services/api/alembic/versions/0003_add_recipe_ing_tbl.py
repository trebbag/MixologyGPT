"""add recipe ingredients table

Revision ID: 0003_add_recipe_ing_tbl
Revises: 0002_add_recipe_ingredients
Create Date: 2026-02-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0003_add_recipe_ing_tbl"
down_revision = "0002_add_recipe_ingredients"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recipe_ingredients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_recipe_ingredients_recipe_id", "recipe_ingredients", ["recipe_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_recipe_ingredients_recipe_id", table_name="recipe_ingredients")
    op.drop_table("recipe_ingredients")
