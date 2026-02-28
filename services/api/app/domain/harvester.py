from dataclasses import dataclass
import re
from typing import Any, Optional
from urllib.parse import urlparse


@dataclass(frozen=True)
class SourcePolicy:
    name: str
    domain: str
    metric_type: str
    min_rating_count: int = 0
    min_rating_value: float = 0.0
    review_policy: str = "manual"
    is_active: bool = True
    seed_urls: Optional[list[str]] = None
    crawl_depth: int = 2
    max_pages: int = 40
    max_recipes: int = 20
    crawl_interval_minutes: int = 240
    respect_robots: bool = True
    parser_settings: Optional[dict[str, Any]] = None
    alert_settings: Optional[dict[str, Any]] = None


DEFAULT_POLICIES = [
    SourcePolicy(
        name="Allrecipes",
        domain="allrecipes.com",
        metric_type="ratings",
        min_rating_count=10,
        seed_urls=["https://www.allrecipes.com/recipes/77/drinks/"],
        parser_settings={
            "recipe_path_hints": ["/recipe/"],
            "blocked_path_hints": ["/recipes-a-z", "/privacy", "/terms", "/account/", "/signin", "/login"],
            "required_text_markers": ["ingredients", "directions"],
        },
    ),
    SourcePolicy(
        name="BBC Good Food",
        domain="bbcgoodfood.com",
        metric_type="ratings",
        min_rating_count=5,
        seed_urls=["https://www.bbcgoodfood.com/recipes/collection/cocktail-recipes"],
        parser_settings={
            "recipe_path_hints": ["/recipes/"],
            "blocked_path_hints": ["/recipes/collection/", "/recipes/category/", "/news-", "/review/", "/feature/"],
            "required_text_markers": ["ingredients", "method"],
        },
    ),
    SourcePolicy(
        name="Food.com",
        domain="food.com",
        metric_type="ratings",
        min_rating_count=5,
        seed_urls=["https://www.food.com/search/cocktail"],
        parser_settings={
            "recipe_path_hints": ["/recipe/"],
            "blocked_path_hints": ["/ideas/", "/article/", "/privacy", "/terms"],
            "required_text_markers": ["ingredients", "directions"],
        },
    ),
    SourcePolicy(
        name="Difford's Guide",
        domain="diffordsguide.com",
        metric_type="pervasiveness",
        seed_urls=["https://www.diffordsguide.com/cocktails/search"],
        parser_settings={
            "recipe_path_hints": ["/cocktails/recipe/"],
            "blocked_path_hints": ["/encyclopedia/", "/cocktails/search", "/cocktails/how-to-make", "/cocktails/directory"],
            "required_text_markers": ["ingredients", "method"],
        },
    ),
    SourcePolicy(
        name="Imbibe",
        domain="imbibemagazine.com",
        metric_type="pervasiveness",
        seed_urls=["https://imbibemagazine.com/category/recipes/"],
        parser_settings={
            "recipe_path_hints": ["/recipe/"],
            "blocked_path_hints": ["/category/recipes/", "/category/", "/events/", "/shop/", "/recipes/page/"],
            "required_text_markers": ["ingredients", "instructions", "directions", "method"],
            "instruction_heading_keywords": ["instructions", "directions", "method", "how to make"],
        },
    ),
    SourcePolicy(
        name="Punch",
        domain="punchdrink.com",
        metric_type="pervasiveness",
        # Seed the root so the crawler can discover sitemap URLs (Punch /recipes is infinite scroll).
        seed_urls=["https://punchdrink.com/", "https://punchdrink.com/recipes/feed/"],
        parser_settings={
            "recipe_path_hints": ["/recipes/"],
            "blocked_path_hints": ["/recipe-archives", "/article/", "/city-guides/", "/menus/", "/how-to/", "/news/"],
            "required_text_markers": ["ingredients", "instructions", "directions", "method"],
            "instruction_heading_keywords": ["instructions", "directions", "method", "preparation"],
            "min_extraction_confidence": 0.3,
        },
    ),
]


def match_policy(source_url: str, policies: list[SourcePolicy]) -> Optional[SourcePolicy]:
    if not source_url:
        return None
    hostname = urlparse(source_url).hostname or ""
    for policy in policies:
        if not policy.is_active:
            continue
        if policy.domain in hostname:
            return policy
    return None


def compute_popularity_score(
    rating_value: Optional[float],
    rating_count: Optional[int],
    like_count: Optional[int],
    share_count: Optional[int],
) -> float:
    score = 0.0
    if rating_value is not None and rating_count:
        score += rating_value * min(rating_count / 50.0, 2.0)
    if like_count:
        score += min(like_count / 100.0, 2.0)
    if share_count:
        score += min(share_count / 100.0, 2.0)
    return score


def normalize_recipe_name(name: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()
    return re.sub(r"\s+", " ", normalized)


def normalize_ingredient_name(name: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()
    return re.sub(r"\s+", " ", normalized)


def ingredient_jaccard_similarity(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


def compute_quality_score(
    policy: SourcePolicy,
    ingredient_count: int,
    instruction_count: int,
    popularity_score: float,
    rating_count: Optional[int],
    rating_value: Optional[float],
    pervasiveness_count: int,
) -> float:
    # Structure quality rewards complete recipes.
    structure_component = min(ingredient_count / 8.0, 1.0) + min(instruction_count / 8.0, 1.0)
    structure_component *= 0.9

    # Trust component reflects source policy strictness.
    trust_component = 0.4
    if policy.metric_type == "ratings":
        trust_component += 0.35
    if policy.review_policy == "auto":
        trust_component += 0.2

    rating_component = 0.0
    if rating_count:
        rating_component += min(rating_count / 50.0, 1.5)
    if rating_value:
        rating_component += min(rating_value / 5.0, 1.0)

    pervasiveness_component = min(max(pervasiveness_count, 0) * 0.25, 1.5)
    score = (
        structure_component
        + trust_component
        + popularity_score
        + rating_component
        + pervasiveness_component
    )
    return round(score, 3)
