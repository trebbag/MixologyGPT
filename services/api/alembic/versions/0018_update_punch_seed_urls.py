"""update punch seed urls for sitemap discovery

Revision ID: 0018_update_punch_seed_urls
Revises: 0017_fix_source_policy_seeds
Create Date: 2026-02-09
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0018_update_punch_seed_urls"
down_revision = "0017_fix_source_policy_seeds"
branch_labels = None
depends_on = None


def _policy_table():
    return sa.table(
        "recipe_source_policies",
        sa.column("domain", sa.String()),
        sa.column("seed_urls", sa.JSON()),
    )


def upgrade() -> None:
    """Punch /recipes uses infinite scroll; seed root so crawler can discover sitemaps."""
    conn = op.get_bind()
    policy_table = _policy_table()
    conn.execute(
        policy_table.update()
        .where(policy_table.c.domain == "punchdrink.com")
        .values(seed_urls=["https://punchdrink.com/", "https://punchdrink.com/recipes/feed/"])
    )


def downgrade() -> None:
    """Restore the previous Punch seed url."""
    conn = op.get_bind()
    policy_table = _policy_table()
    conn.execute(
        policy_table.update()
        .where(policy_table.c.domain == "punchdrink.com")
        .values(seed_urls=["https://punchdrink.com/recipes/"])
    )

