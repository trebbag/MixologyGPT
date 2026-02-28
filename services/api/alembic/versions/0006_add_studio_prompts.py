"""add studio prompts

Revision ID: 0006_add_studio_prompts
Revises: 0005_add_recipe_moderations
Create Date: 2026-02-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0006_add_studio_prompts"
down_revision = "0005_add_recipe_moderations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "studio_prompts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("studio_session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("studio_sessions.id"), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="user"),
        sa.Column("prompt_type", sa.String(), nullable=False, server_default="note"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_studio_prompts_session_id", "studio_prompts", ["studio_session_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_studio_prompts_session_id", table_name="studio_prompts")
    op.drop_table("studio_prompts")
