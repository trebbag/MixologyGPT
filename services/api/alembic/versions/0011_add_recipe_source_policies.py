"""add recipe source policies

Revision ID: 0011_add_recipe_source_policies
Revises: 0010_add_studio_shares
Create Date: 2026-02-07
"""

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0011_add_recipe_source_policies"
down_revision = "0010_add_studio_shares"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recipe_source_policies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("domain", sa.String(), nullable=False),
        sa.Column("metric_type", sa.String(), nullable=False, server_default="ratings"),
        sa.Column("min_rating_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("min_rating_value", sa.Float(), nullable=False, server_default="0"),
        sa.Column("review_policy", sa.String(), nullable=False, server_default="manual"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_recipe_source_policies_domain", "recipe_source_policies", ["domain"], unique=True)

    policies = [
        {
            "id": uuid.uuid4(),
            "name": "Allrecipes",
            "domain": "allrecipes.com",
            "metric_type": "ratings",
            "min_rating_count": 10,
            "min_rating_value": 0.0,
            "review_policy": "manual",
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "name": "BBC Good Food",
            "domain": "bbcgoodfood.com",
            "metric_type": "ratings",
            "min_rating_count": 5,
            "min_rating_value": 0.0,
            "review_policy": "manual",
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "name": "Food.com",
            "domain": "food.com",
            "metric_type": "ratings",
            "min_rating_count": 5,
            "min_rating_value": 0.0,
            "review_policy": "manual",
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "name": "Difford's Guide",
            "domain": "diffordsguide.com",
            "metric_type": "pervasiveness",
            "min_rating_count": 0,
            "min_rating_value": 0.0,
            "review_policy": "manual",
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "name": "Imbibe",
            "domain": "imbibemagazine.com",
            "metric_type": "pervasiveness",
            "min_rating_count": 0,
            "min_rating_value": 0.0,
            "review_policy": "manual",
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "name": "Punch",
            "domain": "punchdrink.com",
            "metric_type": "pervasiveness",
            "min_rating_count": 0,
            "min_rating_value": 0.0,
            "review_policy": "manual",
            "is_active": True,
        },
    ]

    table = sa.table(
        "recipe_source_policies",
        sa.Column("id", postgresql.UUID(as_uuid=True)),
        sa.Column("name", sa.String()),
        sa.Column("domain", sa.String()),
        sa.Column("metric_type", sa.String()),
        sa.Column("min_rating_count", sa.Integer()),
        sa.Column("min_rating_value", sa.Float()),
        sa.Column("review_policy", sa.String()),
        sa.Column("is_active", sa.Boolean()),
    )
    op.bulk_insert(table, policies)


def downgrade() -> None:
    op.drop_index("ix_recipe_source_policies_domain", table_name="recipe_source_policies")
    op.drop_table("recipe_source_policies")
