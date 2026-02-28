"""add system jobs

Revision ID: 0013_add_system_jobs
Revises: 0012_add_recipe_harvest_jobs
Create Date: 2026-02-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0013_add_system_jobs"
down_revision = "0012_add_recipe_harvest_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(), nullable=True),
        sa.Column("last_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_system_jobs_name", "system_jobs", ["name"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_system_jobs_name", table_name="system_jobs")
    op.drop_table("system_jobs")
