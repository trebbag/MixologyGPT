"""add studio and recipe performance indexes

Revision ID: 0019_add_studio_perf_indexes
Revises: 0018_update_punch_seed_urls
Create Date: 2026-03-03
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "0019_add_studio_perf_indexes"
down_revision = "0018_update_punch_seed_urls"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Speed up per-session max/version and list queries on studio flow under load.
    op.create_index(
        "ix_studio_versions_session_version",
        "studio_versions",
        ["studio_session_id", "version"],
        unique=False,
    )
    # Speed up latest-constraint lookup for studio generation.
    op.create_index(
        "ix_studio_constraints_session_created_at",
        "studio_constraints",
        ["studio_session_id", "created_at"],
        unique=False,
    )
    # Speed up case-insensitive recipe search by canonical name.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_recipes_canonical_name_lower "
        "ON recipes (lower(canonical_name))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_recipes_canonical_name_lower")
    op.drop_index("ix_studio_constraints_session_created_at", table_name="studio_constraints")
    op.drop_index("ix_studio_versions_session_version", table_name="studio_versions")
