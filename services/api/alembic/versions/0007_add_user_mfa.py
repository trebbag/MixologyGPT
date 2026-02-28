"""add user mfa fields

Revision ID: 0007_add_user_mfa
Revises: 0006_add_studio_prompts
Create Date: 2026-02-07
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0007_add_user_mfa"
down_revision = "0006_add_studio_prompts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("mfa_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("users", sa.Column("mfa_secret", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "mfa_secret")
    op.drop_column("users", "mfa_enabled")
