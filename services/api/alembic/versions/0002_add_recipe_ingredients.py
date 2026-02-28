"""add recipe ingredients

Revision ID: 0002_add_recipe_ingredients
Revises: 0001_initial
Create Date: 2026-02-06
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0002_add_recipe_ingredients"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("ingredients", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("recipes", "ingredients")
