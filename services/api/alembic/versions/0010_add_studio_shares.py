"""add studio shares

Revision ID: 0010_add_studio_shares
Revises: 0009_add_knowledge_content_hash
Create Date: 2026-02-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0010_add_studio_shares"
down_revision = "0009_add_knowledge_content_hash"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "studio_shares",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("studio_session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("studio_sessions.id"), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_studio_shares_slug", "studio_shares", ["slug"], unique=True)
    op.create_index("ix_studio_shares_session_id", "studio_shares", ["studio_session_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_studio_shares_session_id", table_name="studio_shares")
    op.drop_index("ix_studio_shares_slug", table_name="studio_shares")
    op.drop_table("studio_shares")
