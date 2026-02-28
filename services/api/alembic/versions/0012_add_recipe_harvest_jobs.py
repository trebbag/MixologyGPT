"""add recipe harvest jobs

Revision ID: 0012_add_recipe_harvest_jobs
Revises: 0011_add_recipe_source_policies
Create Date: 2026-02-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0012_add_recipe_harvest_jobs"
down_revision = "0011_add_recipe_source_policies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recipe_harvest_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_url", sa.String(), nullable=False),
        sa.Column("source_type", sa.String(), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("canonical_name", sa.String(), nullable=True),
        sa.Column("author", sa.String(), nullable=True),
        sa.Column("rating_value", sa.Float(), nullable=True),
        sa.Column("rating_count", sa.Integer(), nullable=True),
        sa.Column("like_count", sa.Integer(), nullable=True),
        sa.Column("share_count", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=True),
        sa.Column("duplicate", sa.Boolean(), nullable=True),
        sa.Column("quality_score", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_recipe_harvest_jobs_status", "recipe_harvest_jobs", ["status"], unique=False)
    op.create_index("ix_recipe_harvest_jobs_user_id", "recipe_harvest_jobs", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_recipe_harvest_jobs_user_id", table_name="recipe_harvest_jobs")
    op.drop_index("ix_recipe_harvest_jobs_status", table_name="recipe_harvest_jobs")
    op.drop_table("recipe_harvest_jobs")
