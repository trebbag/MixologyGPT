"""add knowledge documents

Revision ID: 0004_add_knowledge_documents
Revises: 0003_add_recipe_ing_tbl
Create Date: 2026-02-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision = "0004_add_knowledge_documents"
down_revision = "0003_add_recipe_ing_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "knowledge_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("source_url", sa.String(), nullable=True),
        sa.Column("source_type", sa.String(), nullable=True),
        sa.Column("license", sa.String(), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("citations", sa.JSON(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("embedding", Vector(1536)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_knowledge_documents_document_id", "knowledge_documents", ["document_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_knowledge_documents_document_id", table_name="knowledge_documents")
    op.drop_table("knowledge_documents")
