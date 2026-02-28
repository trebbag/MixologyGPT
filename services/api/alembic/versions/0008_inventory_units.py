"""add inventory unit conversion + expiry rule fields

Revision ID: 0008_inventory_units
Revises: 0007_add_user_mfa
Create Date: 2026-02-07
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0008_inventory_units"
down_revision = "0007_add_user_mfa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inventory_items", sa.Column("unit_to_ml", sa.Float(), nullable=True))
    op.add_column("expiry_rules", sa.Column("category", sa.String(), nullable=True))
    op.add_column("expiry_rules", sa.Column("subcategory", sa.String(), nullable=True))
    op.alter_column("expiry_rules", "ingredient_id", existing_type=sa.dialects.postgresql.UUID(as_uuid=True), nullable=True)


def downgrade() -> None:
    op.alter_column("expiry_rules", "ingredient_id", existing_type=sa.dialects.postgresql.UUID(as_uuid=True), nullable=False)
    op.drop_column("expiry_rules", "subcategory")
    op.drop_column("expiry_rules", "category")
    op.drop_column("inventory_items", "unit_to_ml")
