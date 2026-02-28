"""compatibility no-op for duplicate recipe ingredients revision

Revision ID: 0003_add_recipe_ingredients_table
Revises: 0002_add_recipe_ingredients
Create Date: 2026-02-06
"""

# revision identifiers, used by Alembic.
revision = "0003_add_recipe_ing_table"
down_revision = "0003_add_recipe_ing_tbl"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This revision is intentionally a no-op.
    # It exists for compatibility with historical migration branches.
    pass


def downgrade() -> None:
    pass
