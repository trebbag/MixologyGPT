"""fix source policy seed urls

Revision ID: 0017_fix_source_policy_seeds
Revises: 0016_policy_parser_alerts
Create Date: 2026-02-09
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0017_fix_source_policy_seeds"
down_revision = "0016_policy_parser_alerts"
branch_labels = None
depends_on = None


def _policy_table():
    return sa.table(
        "recipe_source_policies",
        sa.column("domain", sa.String()),
        sa.column("seed_urls", sa.JSON()),
    )


def upgrade() -> None:
    """Update seed URLs that have drifted/redirected since initial seeding."""
    conn = op.get_bind()
    policy_table = _policy_table()

    # Keep this consistent with docs/RECIPE_SOURCES.md and app/domain/harvester.py defaults.
    seed_map = {
        "allrecipes.com": ["https://www.allrecipes.com/recipes/77/drinks/"],
        "bbcgoodfood.com": ["https://www.bbcgoodfood.com/recipes/collection/cocktail-recipes"],
        "food.com": ["https://www.food.com/search/cocktail"],
        "diffordsguide.com": ["https://www.diffordsguide.com/cocktails/search"],
        "imbibemagazine.com": ["https://imbibemagazine.com/category/recipes/"],
        "punchdrink.com": ["https://punchdrink.com/recipes/"],
    }

    for domain, seed_urls in seed_map.items():
        conn.execute(
            policy_table.update().where(policy_table.c.domain == domain).values(seed_urls=seed_urls)
        )


def downgrade() -> None:
    """Restore the original seed URLs (may be outdated)."""
    conn = op.get_bind()
    policy_table = _policy_table()

    seed_map = {
        "allrecipes.com": ["https://www.allrecipes.com/recipes/13322/drinks/cocktails/"],
        "bbcgoodfood.com": ["https://www.bbcgoodfood.com/recipes/category/drinks/cocktails"],
        "food.com": ["https://www.food.com/ideas/cocktail-recipes-6754"],
        "diffordsguide.com": ["https://www.diffordsguide.com/cocktails/recipes"],
        "imbibemagazine.com": ["https://imbibemagazine.com/recipes/"],
        "punchdrink.com": ["https://punchdrink.com/recipes/"],
    }

    for domain, seed_urls in seed_map.items():
        conn.execute(
            policy_table.update().where(policy_table.c.domain == domain).values(seed_urls=seed_urls)
        )

