"""add recipe moderations

Revision ID: 0005_add_recipe_moderations
Revises: 0004_add_knowledge_documents
Create Date: 2026-02-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0005_add_recipe_moderations"
down_revision = "0004_add_knowledge_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("review_status", sa.String(), server_default="unreviewed", nullable=False))
    op.add_column("recipes", sa.Column("quality_label", sa.String(), nullable=True))
    op.create_table(
        "recipe_moderations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=False),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("quality_label", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("overrides", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("recipe_moderations")
    op.drop_column("recipes", "quality_label")
    op.drop_column("recipes", "review_status")
