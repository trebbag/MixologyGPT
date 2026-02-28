"""add knowledge content hash

Revision ID: 0009_add_knowledge_content_hash
Revises: 0008_inventory_units
Create Date: 2026-02-07
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0009_add_knowledge_content_hash"
down_revision = "0008_inventory_unit_expiry_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("knowledge_documents", sa.Column("content_hash", sa.String(), nullable=True))
    op.create_index("ix_knowledge_documents_content_hash", "knowledge_documents", ["content_hash"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_knowledge_documents_content_hash", table_name="knowledge_documents")
    op.drop_column("knowledge_documents", "content_hash")
