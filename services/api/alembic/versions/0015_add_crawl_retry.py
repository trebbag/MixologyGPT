"""add crawl fields and harvest retries

Revision ID: 0015_add_crawl_retry
Revises: 0014_add_refresh_sessions
Create Date: 2026-02-08
"""

from alembic import op
import sqlalchemy as sa
import uuid


# revision identifiers, used by Alembic.
revision = "0015_add_crawl_retry"
down_revision = "0014_add_refresh_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "recipe_source_policies",
        sa.Column("seed_urls", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )
    op.add_column(
        "recipe_source_policies",
        sa.Column("crawl_depth", sa.Integer(), nullable=False, server_default="2"),
    )
    op.add_column(
        "recipe_source_policies",
        sa.Column("max_pages", sa.Integer(), nullable=False, server_default="40"),
    )
    op.add_column(
        "recipe_source_policies",
        sa.Column("max_recipes", sa.Integer(), nullable=False, server_default="20"),
    )
    op.add_column(
        "recipe_source_policies",
        sa.Column("crawl_interval_minutes", sa.Integer(), nullable=False, server_default="240"),
    )
    op.add_column(
        "recipe_source_policies",
        sa.Column("respect_robots", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    op.add_column(
        "recipe_harvest_jobs",
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("recipe_harvest_jobs", sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("recipe_harvest_jobs", sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True))

    conn = op.get_bind()
    policy_table = sa.table(
        "recipe_source_policies",
        sa.column("domain", sa.String()),
        sa.column("seed_urls", sa.JSON()),
        sa.column("crawl_depth", sa.Integer()),
        sa.column("max_pages", sa.Integer()),
        sa.column("max_recipes", sa.Integer()),
        sa.column("crawl_interval_minutes", sa.Integer()),
        sa.column("respect_robots", sa.Boolean()),
    )

    seed_map = {
        "allrecipes.com": ["https://www.allrecipes.com/recipes/13322/drinks/cocktails/"],
        "bbcgoodfood.com": ["https://www.bbcgoodfood.com/recipes/category/drinks/cocktails"],
        "food.com": ["https://www.food.com/ideas/cocktail-recipes-6754"],
        "diffordsguide.com": ["https://www.diffordsguide.com/cocktails/recipes"],
        "imbibemagazine.com": ["https://imbibemagazine.com/recipes/"],
        "punchdrink.com": ["https://punchdrink.com/recipes/"],
    }

    count = conn.execute(sa.text("SELECT COUNT(*) FROM recipe_source_policies")).scalar()
    if count == 0:
        defaults = [
            {
                "name": "Allrecipes",
                "domain": "allrecipes.com",
                "metric_type": "ratings",
                "min_rating_count": 10,
                "min_rating_value": 0.0,
                "review_policy": "manual",
                "is_active": True,
                "seed_urls": seed_map["allrecipes.com"],
            },
            {
                "name": "BBC Good Food",
                "domain": "bbcgoodfood.com",
                "metric_type": "ratings",
                "min_rating_count": 5,
                "min_rating_value": 0.0,
                "review_policy": "manual",
                "is_active": True,
                "seed_urls": seed_map["bbcgoodfood.com"],
            },
            {
                "name": "Food.com",
                "domain": "food.com",
                "metric_type": "ratings",
                "min_rating_count": 5,
                "min_rating_value": 0.0,
                "review_policy": "manual",
                "is_active": True,
                "seed_urls": seed_map["food.com"],
            },
            {
                "name": "Difford's Guide",
                "domain": "diffordsguide.com",
                "metric_type": "pervasiveness",
                "min_rating_count": 0,
                "min_rating_value": 0.0,
                "review_policy": "manual",
                "is_active": True,
                "seed_urls": seed_map["diffordsguide.com"],
            },
            {
                "name": "Imbibe",
                "domain": "imbibemagazine.com",
                "metric_type": "pervasiveness",
                "min_rating_count": 0,
                "min_rating_value": 0.0,
                "review_policy": "manual",
                "is_active": True,
                "seed_urls": seed_map["imbibemagazine.com"],
            },
            {
                "name": "Punch",
                "domain": "punchdrink.com",
                "metric_type": "pervasiveness",
                "min_rating_count": 0,
                "min_rating_value": 0.0,
                "review_policy": "manual",
                "is_active": True,
                "seed_urls": seed_map["punchdrink.com"],
            },
        ]
        for row in defaults:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO recipe_source_policies
                    (id, name, domain, metric_type, min_rating_count, min_rating_value, review_policy, is_active,
                     seed_urls, crawl_depth, max_pages, max_recipes, crawl_interval_minutes, respect_robots,
                     created_at, updated_at)
                    VALUES (:id, :name, :domain, :metric_type, :min_rating_count, :min_rating_value,
                            :review_policy, :is_active, :seed_urls, 2, 40, 20, 240, true, now(), now())
                    """
                ),
                {**row, "id": str(uuid.uuid4())},
            )
    else:
        for domain, seed_urls in seed_map.items():
            conn.execute(
                policy_table.update()
                .where(policy_table.c.domain == domain)
                .values(
                    seed_urls=seed_urls,
                    crawl_depth=2,
                    max_pages=40,
                    max_recipes=20,
                    crawl_interval_minutes=240,
                    respect_robots=True,
                )
            )


def downgrade() -> None:
    op.drop_column("recipe_harvest_jobs", "next_retry_at")
    op.drop_column("recipe_harvest_jobs", "last_attempt_at")
    op.drop_column("recipe_harvest_jobs", "attempt_count")
    op.drop_column("recipe_source_policies", "respect_robots")
    op.drop_column("recipe_source_policies", "crawl_interval_minutes")
    op.drop_column("recipe_source_policies", "max_recipes")
    op.drop_column("recipe_source_policies", "max_pages")
    op.drop_column("recipe_source_policies", "crawl_depth")
    op.drop_column("recipe_source_policies", "seed_urls")
