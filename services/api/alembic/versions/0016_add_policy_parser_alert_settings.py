"""add parser/alert policy settings and harvest telemetry fields

Revision ID: 0016_add_policy_parser_alert_settings
Revises: 0015_add_crawl_retry
Create Date: 2026-02-08
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0016_policy_parser_alerts"
down_revision = "0015_add_crawl_retry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "recipe_source_policies",
        sa.Column("parser_settings", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
    )
    op.add_column(
        "recipe_source_policies",
        sa.Column("alert_settings", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
    )
    op.add_column(
        "recipe_harvest_jobs",
        sa.Column("parse_strategy", sa.String(), nullable=True),
    )
    op.add_column(
        "recipe_harvest_jobs",
        sa.Column("compliance_reasons", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("recipe_harvest_jobs", "compliance_reasons")
    op.drop_column("recipe_harvest_jobs", "parse_strategy")
    op.drop_column("recipe_source_policies", "alert_settings")
    op.drop_column("recipe_source_policies", "parser_settings")
