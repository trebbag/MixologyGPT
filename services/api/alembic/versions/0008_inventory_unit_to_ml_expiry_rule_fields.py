"""compatibility no-op for duplicate inventory units revision

Revision ID: 0008_inventory_unit_to_ml_expiry_rule_fields
Revises: 0007_add_user_mfa
Create Date: 2026-02-07
"""

# revision identifiers, used by Alembic.
revision = "0008_inventory_unit_expiry_rules"
down_revision = "0008_inventory_units"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This revision is intentionally a no-op.
    # It exists for compatibility with historical migration branches.
    pass


def downgrade() -> None:
    pass
