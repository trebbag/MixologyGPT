import json
import re
import xml.etree.ElementTree as ET
from collections import deque
from dataclasses import dataclass
from typing import Any, Iterable, Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup


USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


@dataclass
class ParsedRecipe:
    canonical_name: str
    description: Optional[str]
    ingredients: list[dict[str, Any]]
    instructions: list[str]
    author: Optional[str]
    rating_value: Optional[float]
    rating_count: Optional[int]
    like_count: Optional[int]
    share_count: Optional[int]
    source_url: str
    tags: list[str]
    parser_used: str
    fallback_class: Optional[str] = None
    extraction_confidence: float = 0.0


@dataclass
class CrawlResult:
    discovered_urls: list[str]
    parsed_recipes: list[ParsedRecipe]
    parser_stats: dict[str, int]
    confidence_buckets: dict[str, int]
    fallback_class_counts: dict[str, int]
    parse_failure_counts: dict[str, int]
    compliance_rejections: int
    compliance_reason_counts: dict[str, int]
    errors: list[str]


@dataclass(frozen=True)
class DomainRecipeProfile:
    domain: str
    ingredient_selectors: tuple[str, ...]
    instruction_selectors: tuple[str, ...]
    rating_value_selectors: tuple[str, ...]
    rating_count_selectors: tuple[str, ...]
    like_count_selectors: tuple[str, ...]
    share_count_selectors: tuple[str, ...]
    required_text_markers: tuple[str, ...]
    blocked_title_keywords: tuple[str, ...]
    recipe_path_hints: tuple[str, ...]
    blocked_path_hints: tuple[str, ...]


@dataclass(frozen=True)
class ComplianceCheckResult:
    allowed: bool
    reasons: list[str]


DOMAIN_PROFILES: tuple[DomainRecipeProfile, ...] = (
    DomainRecipeProfile(
        domain="allrecipes.com",
        ingredient_selectors=(
            '[data-testid="recipe-ingredients-item"]',
            'li.mm-recipes-structured-ingredients__list-item',
            '[id*="mntl-structured-ingredients"] li',
            '[id*="mntl-structured-ingredients"] .mntl-structured-ingredients__list-item',
            '[class*="recipe-ingredients"] li',
            '[class*="ingredients-list"] li',
        ),
        instruction_selectors=(
            '[data-testid="recipe-instructions"] li',
            '[id*="recipe__steps-content"] li',
            '[class*="instructions"] li',
            '[class*="recipe-directions"] li',
            '[class*="recipe-instructions"] li',
        ),
        rating_value_selectors=(
            '[itemprop="ratingValue"]',
            '.mntl-recipe-review-bar__rating',
            '[data-rating-stars]',
            '[data-rating]',
            '[aria-label*="rating"]',
        ),
        rating_count_selectors=(
            '[itemprop="ratingCount"]',
            '[itemprop="reviewCount"]',
            '.mntl-recipe-review-bar__rating-count',
            '[data-ratings-count]',
            '[data-rating-count]',
            '[class*="review-count"]',
        ),
        like_count_selectors=(
            '[data-like-count]',
            '[class*="like-count"]',
            '[aria-label*="Like"]',
            '[class*="favorite-count"]',
        ),
        share_count_selectors=(
            '[data-share-count]',
            '[class*="share-count"]',
            '[aria-label*="Share"]',
            '[class*="social-count"]',
        ),
        required_text_markers=("ingredients", "directions"),
        blocked_title_keywords=("privacy", "terms", "cookie", "login", "sign in"),
        recipe_path_hints=("/recipe/",),
        blocked_path_hints=(
            "/privacy",
            "/terms",
            "/account/",
            "/signin",
            "/login",
            "/news/",
            "/about-",
            "/recipes-a-z",
        ),
    ),
    DomainRecipeProfile(
        domain="bbcgoodfood.com",
        ingredient_selectors=(
            '.recipe__ingredients li',
            '[class*="ingredients-list"] li',
            '[class*="recipe-ingredients"] li',
            '[class*="ingredients"] li',
        ),
        instruction_selectors=(
            '.recipe__method-steps li',
            '[class*="method-steps"] li',
            '[class*="recipe-method"] li',
            '[class*="instructions"] li',
        ),
        rating_value_selectors=(
            '[itemprop="ratingValue"]',
            '[class*="rating"] [class*="value"]',
            '[data-rating]',
        ),
        rating_count_selectors=(
            '[itemprop="ratingCount"]',
            '[itemprop="reviewCount"]',
            '[class*="rating"] [class*="count"]',
            '[class*="review-count"]',
        ),
        like_count_selectors=('[data-like-count]', '[class*="like-count"]'),
        share_count_selectors=('[data-share-count]', '[class*="share-count"]'),
        required_text_markers=("ingredients", "method"),
        blocked_title_keywords=("privacy", "terms", "cookie", "subscribe"),
        recipe_path_hints=("/recipes/",),
        blocked_path_hints=(
            "/recipes/collection/",
            "/recipes/category/",
            "/news-",
            "/review/",
            "/health/",
            "/howto/",
            "/feature/",
            "/recipes/search",
        ),
    ),
    DomainRecipeProfile(
        domain="food.com",
        ingredient_selectors=(
            '.recipe-ingredients li',
            '.recipe-ingredients__ingredient',
            '[class*="ingredients"] li',
            '[class*="ingredient-list"] li',
        ),
        instruction_selectors=(
            '.recipe-directions li',
            '[class*="directions"] li',
            '[class*="instructions"] li',
            '[class*="method"] li',
        ),
        rating_value_selectors=(
            '[itemprop="ratingValue"]',
            '[class*="rating"] [class*="value"]',
            '[data-rating]',
        ),
        rating_count_selectors=(
            '[itemprop="ratingCount"]',
            '[itemprop="reviewCount"]',
            '[class*="review-count"]',
            '[data-rating-count]',
        ),
        like_count_selectors=('[data-like-count]', '[class*="save-count"]'),
        share_count_selectors=('[data-share-count]', '[class*="share-count"]'),
        required_text_markers=("ingredients", "directions"),
        blocked_title_keywords=("privacy", "terms", "cookie", "login"),
        recipe_path_hints=("/recipe/",),
        blocked_path_hints=(
            "/ideas/",
            "/article/",
            "/about",
            "/privacy",
            "/terms",
        ),
    ),
    DomainRecipeProfile(
        domain="diffordsguide.com",
        ingredient_selectors=(
            '.recipe-ingredients li',
            '[class*="ingredients"] li',
        ),
        instruction_selectors=(
            '.recipe-method li',
            '[class*="method"] li',
            '[class*="preparation"] li',
        ),
        rating_value_selectors=('[itemprop="ratingValue"]', '[class*="rating"] [class*="value"]'),
        rating_count_selectors=('[itemprop="ratingCount"]', '[class*="rating"] [class*="count"]'),
        like_count_selectors=('[data-like-count]', '[class*="like-count"]'),
        share_count_selectors=('[data-share-count]', '[class*="share-count"]'),
        required_text_markers=("ingredients", "method"),
        blocked_title_keywords=("privacy", "terms", "cookie", "subscribe"),
        recipe_path_hints=("/cocktails/recipe/",),
        blocked_path_hints=(
            "/encyclopedia/",
            "/cocktails/search",
            "/cocktails/how-to-make",
            "/cocktails/most-viewed",
            "/cocktails/20-best",
            "/cocktails/directory",
            "/forum/",
        ),
    ),
    DomainRecipeProfile(
        domain="imbibemagazine.com",
        ingredient_selectors=(
            '.wprm-recipe-ingredient',
            '.mv-create-ingredients li',
            '[class*="ingredients"] li',
        ),
        instruction_selectors=(
            '.wprm-recipe-instruction-text',
            '.mv-create-instructions li',
            '[class*="instructions"] li',
        ),
        rating_value_selectors=('[itemprop="ratingValue"]', '[class*="rating"] [class*="value"]'),
        rating_count_selectors=('[itemprop="ratingCount"]', '[itemprop="reviewCount"]'),
        like_count_selectors=('[data-like-count]', '[class*="like-count"]'),
        share_count_selectors=('[data-share-count]', '[class*="shared-count"]'),
        required_text_markers=("ingredients", "instructions", "directions", "method"),
        blocked_title_keywords=("privacy", "terms", "cookie", "subscribe"),
        recipe_path_hints=("/recipe/",),
        blocked_path_hints=(
            "/category/recipes/",
            "/category/",
            "/events/",
            "/shop/",
            "/about/",
            "/newsletter/",
            "/recipes/page/",
        ),
    ),
    DomainRecipeProfile(
        domain="punchdrink.com",
        ingredient_selectors=(
            '.wprm-recipe-ingredient',
            '.entry-content [class*="ingredients"] li',
            '[class*="ingredients"] li',
        ),
        instruction_selectors=(
            '.wprm-recipe-instruction-text',
            '[class*="instructions"] li',
            '.entry-content [class*="method"] li',
        ),
        rating_value_selectors=('[itemprop="ratingValue"]', '[class*="rating"] [class*="value"]'),
        rating_count_selectors=('[itemprop="ratingCount"]', '[itemprop="reviewCount"]'),
        like_count_selectors=('[data-like-count]', '[class*="like-count"]'),
        share_count_selectors=('[data-share-count]', '[class*="shared-count"]'),
        required_text_markers=("ingredients", "instructions", "directions", "method"),
        blocked_title_keywords=("privacy", "terms", "cookie", "subscribe"),
        recipe_path_hints=("/recipes/",),
        blocked_path_hints=(
            "/recipe-archives",
            "/article/",
            "/city-guides/",
            "/menus/",
            "/how-to/",
            "/news/",
            "/pro/",
        ),
    ),
)


COUNT_REGEX = re.compile(r"([0-9][0-9,]*(?:\.[0-9]+)?)\s*([kKmMbB])?\+?")
RATING_COUNT_CONTEXT_REGEX = re.compile(
    r"([0-9][0-9,]*(?:\.[0-9]+)?)\s*([kKmMbB])?\+?\s*(?:ratings?|reviews?|votes?)"
)
SOCIAL_COUNT_CONTEXT_REGEX = re.compile(
    r"([0-9][0-9,]*(?:\.[0-9]+)?)\s*([kKmMbB])?\+?\s*(?:likes?|shares?)"
)
STAR_REGEX = re.compile(r"([0-5](?:\.[0-9]+)?)\s*(?:/|out of)\s*5")
BBC_USER_RATINGS_REGEX = re.compile(
    r'"userRatings"\s*:\s*\{\s*"avg"\s*:\s*(?P<avg>[0-5](?:\.[0-9]+)?)\s*,\s*"total"\s*:\s*(?P<total>[0-9]+)',
    re.IGNORECASE,
)


def normalize_url(url: str) -> str:
    if not url:
        return ""
    cleaned = url.split("#")[0].strip()
    return cleaned.split("?")[0].strip()


def _normalized_hostname(url: str) -> str:
    hostname = (urlparse(url).hostname or "").lower()
    if hostname.startswith("www."):
        return hostname[4:]
    return hostname


def domain_profile_for_url(url: str) -> Optional[DomainRecipeProfile]:
    hostname = _normalized_hostname(url)
    if not hostname:
        return None
    for profile in DOMAIN_PROFILES:
        if hostname == profile.domain or hostname.endswith(f".{profile.domain}"):
            return profile
    return None


def _tuple_merge(defaults: tuple[str, ...], override: Any) -> tuple[str, ...]:
    if not isinstance(override, list):
        return defaults
    cleaned = [str(item).strip() for item in override if str(item).strip()]
    return tuple(cleaned) if cleaned else defaults


def _bool_setting(settings: Optional[dict[str, Any]], key: str, default: bool) -> bool:
    if not settings:
        return default
    value = settings.get(key)
    if isinstance(value, bool):
        return value
    return default


def _keyword_setting(
    settings: Optional[dict[str, Any]],
    key: str,
    defaults: tuple[str, ...],
) -> tuple[str, ...]:
    if not settings:
        return defaults
    raw = settings.get(key)
    if not isinstance(raw, list):
        return defaults
    cleaned = [str(item).strip().lower() for item in raw if str(item).strip()]
    return tuple(cleaned) if cleaned else defaults


def _effective_profile(
    source_url: str,
    parser_settings: Optional[dict[str, Any]] = None,
) -> Optional[DomainRecipeProfile]:
    profile = domain_profile_for_url(source_url)
    if not profile:
        return None
    settings = parser_settings or {}
    return DomainRecipeProfile(
        domain=profile.domain,
        ingredient_selectors=_tuple_merge(profile.ingredient_selectors, settings.get("ingredient_selectors")),
        instruction_selectors=_tuple_merge(profile.instruction_selectors, settings.get("instruction_selectors")),
        rating_value_selectors=_tuple_merge(profile.rating_value_selectors, settings.get("rating_value_selectors")),
        rating_count_selectors=_tuple_merge(profile.rating_count_selectors, settings.get("rating_count_selectors")),
        like_count_selectors=_tuple_merge(profile.like_count_selectors, settings.get("like_count_selectors")),
        share_count_selectors=_tuple_merge(profile.share_count_selectors, settings.get("share_count_selectors")),
        required_text_markers=_tuple_merge(profile.required_text_markers, settings.get("required_text_markers")),
        blocked_title_keywords=_tuple_merge(profile.blocked_title_keywords, settings.get("blocked_title_keywords")),
        recipe_path_hints=_tuple_merge(profile.recipe_path_hints, settings.get("recipe_path_hints")),
        blocked_path_hints=_tuple_merge(profile.blocked_path_hints, settings.get("blocked_path_hints")),
    )


def _selector_match_count(soup: BeautifulSoup, selectors: Iterable[str]) -> int:
    total = 0
    for selector in selectors:
        total += len(soup.select(selector))
    return total


def _extract_section_list_items(soup: BeautifulSoup, keywords: Iterable[str]) -> list[str]:
    headings = soup.find_all(["h2", "h3", "h4", "strong"])
    normalized_keywords = [kw.lower() for kw in keywords]
    collected: list[str] = []
    for heading in headings:
        label = heading.get_text(" ", strip=True).lower()
        if not label or not any(key in label for key in normalized_keywords):
            continue
        section = heading.find_parent(["section", "div", "article"]) or heading.parent
        if not section:
            continue
        candidates = section.find_all(["li", "p"])
        for node in candidates:
            text = node.get_text(" ", strip=True)
            if text and len(text.split()) >= 2:
                collected.append(text)
        if collected:
            return collected
        sibling = heading.find_next_sibling(["ul", "ol"])
        if sibling:
            for node in sibling.find_all("li"):
                text = node.get_text(" ", strip=True)
                if text:
                    collected.append(text)
        if collected:
            return collected
    return collected


def _contains_recipe_microdata(soup: BeautifulSoup) -> bool:
    has_ingredients = bool(soup.select('[itemprop="recipeIngredient"]'))
    has_instructions = bool(soup.select('[itemprop="recipeInstructions"]'))
    return has_ingredients or has_instructions


def classify_dom_fallback(
    soup: BeautifulSoup,
    source_url: str,
    parser_settings: Optional[dict[str, Any]] = None,
) -> str:
    profile = _effective_profile(source_url, parser_settings=parser_settings)
    instruction_keywords = _keyword_setting(
        parser_settings,
        "instruction_heading_keywords",
        ("directions", "method", "instructions", "preparation", "steps"),
    )
    if profile:
        profile_ingredients = _selector_match_count(soup, profile.ingredient_selectors)
        profile_instructions = _selector_match_count(soup, profile.instruction_selectors)
        if profile_ingredients == 0 and profile_instructions == 0:
            return "domain-selector-mismatch"
        if profile_ingredients < 2:
            return "domain-ingredients-sparse"
        if profile_instructions < 1:
            heading_instruction_hits = len(_extract_section_list_items(soup, instruction_keywords))
            if profile_ingredients >= 2 and heading_instruction_hits == 0:
                return "instruction-structure-mismatch"
            return "domain-instructions-sparse"
    jsonld_items = _extract_jsonld(soup)
    if _find_recipe_jsonld(jsonld_items) or _find_recipe_like_jsonld(jsonld_items):
        return "jsonld-incomplete"
    if _contains_recipe_microdata(soup):
        return "microdata-incomplete"
    return "generic-dom-pattern"


def classify_parse_failure(
    html: str,
    source_url: str,
    parser_settings: Optional[dict[str, Any]] = None,
) -> str:
    soup = BeautifulSoup(html, "html.parser")
    profile = _effective_profile(source_url, parser_settings=parser_settings)
    instruction_keywords = _keyword_setting(
        parser_settings,
        "instruction_heading_keywords",
        ("directions", "method", "instructions", "preparation", "steps"),
    )
    if profile:
        profile_ingredients = _selector_match_count(soup, profile.ingredient_selectors)
        profile_instructions = _selector_match_count(soup, profile.instruction_selectors)
        if profile_ingredients == 0 and profile_instructions == 0:
            return "domain-selector-mismatch"
        if profile_ingredients < 2:
            return "domain-ingredients-sparse"
        if profile_instructions < 1:
            heading_instruction_hits = len(_extract_section_list_items(soup, instruction_keywords))
            if profile_ingredients >= 2 and heading_instruction_hits == 0:
                return "instruction-structure-mismatch"
            return "domain-instructions-sparse"
    jsonld_items = _extract_jsonld(soup)
    if _find_recipe_jsonld(jsonld_items) or _find_recipe_like_jsonld(jsonld_items):
        return "jsonld-parse-failed"
    if _contains_recipe_microdata(soup):
        return "microdata-parse-failed"
    text = soup.get_text(" ", strip=True).lower()
    if not text:
        return "empty-document"
    if "ingredients" not in text and "instructions" not in text and "directions" not in text and "method" not in text:
        return "missing-recipe-markers"
    if len(text) < 80:
        return "insufficient-page-content"
    return "unknown-parse-failure"


def _dedupe_preserve_order(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        cleaned = str(value or "").strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        deduped.append(cleaned)
    return deduped


def _merged_setting_list(
    settings: dict[str, Any],
    key: str,
    extras: Iterable[str],
) -> list[str]:
    current = settings.get(key)
    current_values = current if isinstance(current, list) else []
    return _dedupe_preserve_order([*current_values, *extras])


def build_recovery_parser_settings(
    parse_failure: str,
    source_url: str,
    parser_settings: Optional[dict[str, Any]] = None,
) -> tuple[dict[str, Any], list[str]]:
    settings: dict[str, Any] = dict(parser_settings or {})
    actions: list[str] = []

    if not _bool_setting(settings, "enable_recovery", True):
        return settings, []

    if parse_failure in {"domain-selector-mismatch", "domain-ingredients-sparse"}:
        ingredient_selectors = _merged_setting_list(
            settings,
            "ingredient_selectors",
            (
                ".ingredients li",
                ".recipe-ingredients li",
                "[class*='ingredient'] li",
                "[id*='ingredient'] li",
                "[itemprop='recipeIngredient']",
            ),
        )
        if ingredient_selectors:
            settings["ingredient_selectors"] = ingredient_selectors
        actions.append("broaden-ingredient-selectors")

    if parse_failure in {
        "domain-selector-mismatch",
        "domain-instructions-sparse",
        "instruction-structure-mismatch",
    }:
        instruction_selectors = _merged_setting_list(
            settings,
            "instruction_selectors",
            (
                ".instructions li",
                ".recipe-instructions li",
                ".directions li",
                ".method li",
                "[class*='instruction'] li",
                "[id*='instruction'] li",
                "[itemprop='recipeInstructions'] li",
            ),
        )
        if instruction_selectors:
            settings["instruction_selectors"] = instruction_selectors
        instruction_keywords = _merged_setting_list(
            settings,
            "instruction_heading_keywords",
            ("directions", "method", "instructions", "preparation", "steps", "how to make"),
        )
        settings["instruction_heading_keywords"] = instruction_keywords
        actions.append("broaden-instruction-selectors")

    if parse_failure in {"jsonld-parse-failed", "jsonld-incomplete"}:
        settings["enable_jsonld"] = False
        settings["enable_domain_dom"] = True
        settings["enable_dom_fallback"] = True
        actions.append("disable-jsonld")

    if parse_failure in {"microdata-parse-failed", "microdata-incomplete"}:
        settings["enable_microdata"] = False
        settings["enable_domain_dom"] = True
        settings["enable_dom_fallback"] = True
        actions.append("disable-microdata")

    if parse_failure == "low-confidence-parse":
        try:
            current_min = float(settings.get("min_extraction_confidence", 0.35))
        except (TypeError, ValueError):
            current_min = 0.35
        settings["min_extraction_confidence"] = max(0.2, current_min - 0.1)
        settings["penalize_missing_engagement_signals"] = False
        actions.append("relax-confidence-threshold")

    if parse_failure in {"missing-recipe-markers", "insufficient-page-content"}:
        profile = _effective_profile(source_url, parser_settings=settings)
        required_markers = list(profile.required_text_markers) if profile else []
        required_markers.extend(("ingredients", "directions", "instructions", "method"))
        settings["required_text_markers"] = _dedupe_preserve_order(required_markers)
        actions.append("widen-required-markers")

    if actions:
        # Recovery mode is allowed to temporarily enable parsers even if the base policy disables them,
        # so we can surface a "recovered" parse strategy and then decide whether to promote settings.
        settings["enable_domain_dom"] = True
        settings["enable_dom_fallback"] = True
    return settings, _dedupe_preserve_order(actions)


def parse_recipe_with_recovery(
    html: str,
    source_url: str,
    parse_failure: str,
    parser_settings: Optional[dict[str, Any]] = None,
) -> Optional[ParsedRecipe]:
    recovery_settings, actions = build_recovery_parser_settings(
        parse_failure=parse_failure,
        source_url=source_url,
        parser_settings=parser_settings,
    )
    if not actions:
        return None
    parsed = parse_recipe_from_html(html, source_url, parser_settings=recovery_settings)
    if not parsed:
        return None
    parsed.parser_used = f"recovery_{parsed.parser_used}"
    if not parsed.fallback_class:
        parsed.fallback_class = parse_failure
    return _attach_extraction_confidence(parsed, source_url, parser_settings=recovery_settings)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _float_setting(settings: Optional[dict[str, Any]], key: str, default: float) -> float:
    if not settings:
        return default
    value = settings.get(key)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _extraction_confidence_bucket(score: float) -> str:
    if score >= 0.8:
        return "high"
    if score >= 0.6:
        return "medium"
    return "low"


def _compute_extraction_confidence(
    parsed: ParsedRecipe,
    source_url: str,
    parser_settings: Optional[dict[str, Any]] = None,
) -> float:
    settings = parser_settings or {}
    parser_key = parsed.parser_used or ""
    recovery_penalty = 0.0
    if parser_key.startswith("recovery_"):
        parser_key = parser_key[len("recovery_") :]
        recovery_penalty = 0.06
    parser_base = {
        "jsonld": 0.9,
        "jsonld_recipe_fields": 0.82,
        "domain_dom": 0.86,
        "microdata": 0.79,
        "dom_fallback": 0.62,
    }.get(parser_key, 0.55)

    ingredient_score = _clamp(len(parsed.ingredients) / 6.0, 0.0, 1.0)
    instruction_score = _clamp(len(parsed.instructions) / 5.0, 0.0, 1.0)
    rating_signal = 1.0 if (parsed.rating_value or 0.0) >= 4.0 and (parsed.rating_count or 0) >= 10 else 0.0
    social_signal = 1.0 if (parsed.like_count or 0) > 0 or (parsed.share_count or 0) > 0 else 0.0
    profile_bonus = 0.05 if _effective_profile(source_url, parser_settings=settings) else 0.0
    engagement_penalty = 0.0
    if _bool_setting(settings, "penalize_missing_engagement_signals", True):
        if rating_signal == 0.0 and social_signal == 0.0:
            engagement_penalty = 0.04

    fallback_penalty = 0.0
    if parsed.parser_used == "dom_fallback":
        fallback_penalty = {
            "domain-selector-mismatch": 0.18,
            "domain-ingredients-sparse": 0.14,
            "domain-instructions-sparse": 0.14,
            "instruction-structure-mismatch": 0.16,
            "jsonld-incomplete": 0.08,
            "microdata-incomplete": 0.08,
            "generic-dom-pattern": 0.05,
        }.get(parsed.fallback_class or "generic-dom-pattern", 0.1)

    raw_score = (
        (parser_base * 0.56)
        + (ingredient_score * 0.2)
        + (instruction_score * 0.16)
        + (rating_signal * 0.04)
        + (social_signal * 0.04)
        + profile_bonus
        - fallback_penalty
        - engagement_penalty
        - recovery_penalty
        + _float_setting(settings, "confidence_bias", 0.0)
    )
    return round(_clamp(raw_score, 0.0, 1.0), 3)


def _attach_extraction_confidence(
    parsed: Optional[ParsedRecipe],
    source_url: str,
    parser_settings: Optional[dict[str, Any]] = None,
) -> Optional[ParsedRecipe]:
    if not parsed:
        return None
    parsed.extraction_confidence = _compute_extraction_confidence(
        parsed,
        source_url,
        parser_settings=parser_settings,
    )
    return parsed


def _normalized_path(url: str) -> str:
    path = (urlparse(url).path or "").strip().lower()
    if not path.startswith("/"):
        path = f"/{path}" if path else "/"
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    return path


def _path_has_any_token(path: str, tokens: Iterable[str]) -> bool:
    for token in tokens:
        normalized = token.strip().lower()
        if not normalized:
            continue
        if normalized in path:
            return True
    return False


def is_probable_recipe_url(url: str, parser_settings: Optional[dict[str, Any]] = None) -> bool:
    lowered = url.lower()
    path = _normalized_path(url)
    profile = _effective_profile(url, parser_settings=parser_settings)
    if profile and _path_has_any_token(path, profile.blocked_path_hints):
        return False
    if _path_has_any_token(path, ("/privacy", "/terms", "/about", "/login", "/signin", "/cookie")):
        return False

    if profile:
        if _path_has_any_token(path, profile.recipe_path_hints):
            for hint in profile.recipe_path_hints:
                normalized_hint = hint.strip().lower().rstrip("/")
                if not normalized_hint or normalized_hint not in path:
                    continue
                tail = path.split(normalized_hint, 1)[1].strip("/")
                # Prevent list/index pages like "/recipes" or "/recipes/" from flooding the queue.
                if tail:
                    return True
        return False

    return any(token in lowered for token in ["/recipe/", "/recipes/", "/cocktail/", "/cocktails/", "/drink/"])


def _flatten_jsonld(obj: Any) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if isinstance(obj, list):
        for entry in obj:
            items.extend(_flatten_jsonld(entry))
    elif isinstance(obj, dict):
        if "@graph" in obj and isinstance(obj["@graph"], list):
            for entry in obj["@graph"]:
                items.extend(_flatten_jsonld(entry))
        else:
            items.append(obj)
    return items


def _extract_jsonld(soup: BeautifulSoup) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for script in soup.find_all("script", type="application/ld+json"):
        raw = script.string or script.get_text() or ""
        raw = raw.strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        items.extend(_flatten_jsonld(data))
    return items


def _find_recipe_jsonld(items: Iterable[dict[str, Any]]) -> Optional[dict[str, Any]]:
    for item in items:
        types = item.get("@type")
        if isinstance(types, list):
            if any(t.lower() == "recipe" for t in types if isinstance(t, str)):
                return item
        elif isinstance(types, str) and types.lower() == "recipe":
            return item
    return None


def _find_recipe_like_jsonld(items: Iterable[dict[str, Any]]) -> Optional[dict[str, Any]]:
    for item in items:
        if not isinstance(item, dict):
            continue
        ingredients = item.get("recipeIngredient")
        instructions = item.get("recipeInstructions")
        if not ingredients or not instructions:
            continue
        normalized_instructions = _normalize_instructions(instructions)
        if isinstance(ingredients, list) and len(ingredients) >= 2 and len(normalized_instructions) >= 1:
            return item
    return None


def _to_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> Optional[int]:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _to_compact_int(raw_number: str, suffix: Optional[str]) -> Optional[int]:
    try:
        base = float(raw_number.replace(",", ""))
    except ValueError:
        return None
    factor = 1.0
    lowered = (suffix or "").lower()
    if lowered == "k":
        factor = 1_000.0
    elif lowered == "m":
        factor = 1_000_000.0
    elif lowered == "b":
        factor = 1_000_000_000.0
    return int(base * factor)


def _extract_first_count(text: str) -> Optional[int]:
    if not text:
        return None
    normalized = text.strip()
    if not normalized:
        return None

    for regex in (RATING_COUNT_CONTEXT_REGEX, SOCIAL_COUNT_CONTEXT_REGEX):
        match = regex.search(normalized)
        if match:
            return _to_compact_int(match.group(1), match.group(2))

    if STAR_REGEX.search(normalized) and ("rating" in normalized.lower() or "out of" in normalized.lower()):
        return None

    matches = COUNT_REGEX.findall(normalized)
    for raw_number, suffix in matches:
        parsed = _to_compact_int(raw_number, suffix)
        if parsed is None:
            continue
        if parsed < 10 and ("/5" in normalized or "out of" in normalized.lower()):
            continue
        return parsed
    return None


def _extract_first_star(text: str) -> Optional[float]:
    if not text:
        return None
    star_match = STAR_REGEX.search(text)
    if star_match:
        return _to_float(star_match.group(1))
    return _to_float(text)


def _parse_ingredient_line(line: str) -> dict[str, Any]:
    match = re.match(r"^(?P<qty>[0-9]+(?:\\.[0-9]+)?)\\s*(?P<unit>[a-zA-Z]+)?\\s+(?P<name>.+)$", line)
    if match:
        qty = _to_float(match.group("qty")) or 1.0
        unit = (match.group("unit") or "unit").lower()
        name = match.group("name").strip()
        return {"name": name, "quantity": qty, "unit": unit}
    return {"name": line.strip(), "quantity": 1.0, "unit": "unit"}


def _normalize_instructions(value: Any) -> list[str]:
    instructions: list[str] = []
    if isinstance(value, list):
        for entry in value:
            if isinstance(entry, str):
                instructions.append(entry.strip())
            elif isinstance(entry, dict):
                text = entry.get("text") or entry.get("name")
                if text:
                    instructions.append(str(text).strip())
            elif isinstance(entry, list):
                instructions.extend(_normalize_instructions(entry))
    elif isinstance(value, dict):
        if "itemListElement" in value:
            instructions.extend(_normalize_instructions(value.get("itemListElement")))
        else:
            text = value.get("text") or value.get("name")
            if text:
                instructions.append(str(text).strip())
    elif isinstance(value, str):
        instructions.extend([line.strip() for line in value.splitlines() if line.strip()])
    return [step for step in instructions if step]


def _parse_interaction_stats(stats: Any) -> tuple[Optional[int], Optional[int]]:
    like_count = None
    share_count = None
    if isinstance(stats, dict):
        stats = [stats]
    if not isinstance(stats, list):
        return like_count, share_count
    for entry in stats:
        if not isinstance(entry, dict):
            continue
        interaction_type_value = entry.get("interactionType", "")
        if isinstance(interaction_type_value, dict):
            interaction_type = str(
                interaction_type_value.get("@type")
                or interaction_type_value.get("name")
                or interaction_type_value
            ).lower()
        else:
            interaction_type = str(interaction_type_value).lower()
        count = _to_int(entry.get("userInteractionCount"))
        if "like" in interaction_type and count is not None:
            like_count = count
        if "share" in interaction_type and count is not None:
            share_count = count
    return like_count, share_count


def _extract_meta_value(tag: Optional[Any]) -> Optional[str]:
    if not tag:
        return None
    if isinstance(tag, str):
        return tag.strip()
    content = tag.get("content") or tag.get("value")
    if content:
        return str(content).strip()
    text = tag.get_text(strip=True) if hasattr(tag, "get_text") else None
    return str(text).strip() if text else None


def _parse_rating_from_dom(soup: BeautifulSoup) -> tuple[Optional[float], Optional[int]]:
    rating_value = None
    rating_count = None
    rating_value_tag = soup.select_one('[itemprop="ratingValue"]')
    rating_count_tag = soup.select_one('[itemprop="ratingCount"]') or soup.select_one('[itemprop="reviewCount"]')
    rating_value = _to_float(_extract_meta_value(rating_value_tag)) or rating_value
    rating_count = _to_int(_extract_meta_value(rating_count_tag)) or rating_count
    aggregate = soup.select_one('[itemprop="aggregateRating"]')
    if aggregate:
        rating_value = _to_float(_extract_meta_value(aggregate.select_one('[itemprop="ratingValue"]'))) or rating_value
        rating_count = _to_int(_extract_meta_value(aggregate.select_one('[itemprop="ratingCount"]'))) or rating_count
        rating_count = _to_int(_extract_meta_value(aggregate.select_one('[itemprop="reviewCount"]'))) or rating_count
    return rating_value, rating_count


def _extract_numeric_from_node(node: Any, kind: str) -> Optional[float]:
    if not node:
        return None
    raw_values = []
    for attr in (
        "content",
        "data-value",
        "data-rating",
        "data-rating-value",
        "data-rating-count",
        "data-review-count",
        "data-like-count",
        "data-share-count",
        "aria-label",
        "title",
    ):
        value = node.get(attr) if hasattr(node, "get") else None
        if value:
            raw_values.append(str(value))
    if hasattr(node, "get_text"):
        text = node.get_text(" ", strip=True)
        if text:
            raw_values.append(text)
    for raw in raw_values:
        if kind == "star":
            parsed = _extract_first_star(raw)
        else:
            parsed = _extract_first_count(raw)
        if parsed is not None:
            return float(parsed)
    return None


def _extract_numeric_from_selectors(
    soup: BeautifulSoup, selectors: Iterable[str], kind: str
) -> Optional[float]:
    for selector in selectors:
        for node in soup.select(selector):
            parsed = _extract_numeric_from_node(node, kind)
            if parsed is not None:
                return parsed
    return None


def _extract_signal_from_text(text: str) -> tuple[Optional[float], Optional[int], Optional[int], Optional[int]]:
    rating_value = None
    rating_count = None
    like_count = None
    share_count = None
    lowered = (text or "").lower()
    if not lowered:
        return rating_value, rating_count, like_count, share_count

    rating_match = re.search(r"([0-5](?:\.[0-9]+)?)\s*(?:out of|/)\s*5", lowered)
    if rating_match:
        rating_value = _to_float(rating_match.group(1))

    rating_count_match = RATING_COUNT_CONTEXT_REGEX.search(lowered)
    if rating_count_match:
        rating_count = _to_compact_int(rating_count_match.group(1), rating_count_match.group(2))

    like_count_match = re.search(
        r"([0-9][0-9,]*(?:\.[0-9]+)?)\s*([kKmMbB])?\+?\s*(?:likes?)",
        lowered,
    )
    if like_count_match:
        like_count = _to_compact_int(like_count_match.group(1), like_count_match.group(2))

    share_count_match = re.search(
        r"([0-9][0-9,]*(?:\.[0-9]+)?)\s*([kKmMbB])?\+?\s*(?:shares?)",
        lowered,
    )
    if share_count_match:
        share_count = _to_compact_int(share_count_match.group(1), share_count_match.group(2))

    return rating_value, rating_count, like_count, share_count


def _parse_signal_from_dom(
    soup: BeautifulSoup,
    source_url: str,
    parser_settings: Optional[dict[str, Any]] = None,
) -> tuple[Optional[float], Optional[int], Optional[int], Optional[int]]:
    profile = _effective_profile(source_url, parser_settings=parser_settings)
    generic_rating_selectors = (
        '[itemprop="ratingValue"]',
        'meta[property="og:rating"]',
        'meta[name="rating"]',
        '[data-rating]',
        '[data-rating-value]',
    )
    generic_rating_count_selectors = (
        '[itemprop="ratingCount"]',
        '[itemprop="reviewCount"]',
        '[data-rating-count]',
        '[data-review-count]',
    )
    generic_like_selectors = ('[data-like-count]', '[class*="like-count"]', '[aria-label*="Like"]')
    generic_share_selectors = ('[data-share-count]', '[class*="share-count"]', '[aria-label*="Share"]')

    rating_selectors = list(generic_rating_selectors)
    rating_count_selectors = list(generic_rating_count_selectors)
    like_selectors = list(generic_like_selectors)
    share_selectors = list(generic_share_selectors)
    if profile:
        rating_selectors.extend(profile.rating_value_selectors)
        rating_count_selectors.extend(profile.rating_count_selectors)
        like_selectors.extend(profile.like_count_selectors)
        share_selectors.extend(profile.share_count_selectors)

    rating_value = _extract_numeric_from_selectors(soup, rating_selectors, kind="star")
    rating_count_raw = _extract_numeric_from_selectors(soup, rating_count_selectors, kind="count")
    like_count_raw = _extract_numeric_from_selectors(soup, like_selectors, kind="count")
    share_count_raw = _extract_numeric_from_selectors(soup, share_selectors, kind="count")

    text_rating, text_rating_count, text_like_count, text_share_count = _extract_signal_from_text(
        soup.get_text(" ", strip=True)
    )

    rating_value = rating_value if rating_value is not None else text_rating
    rating_count = _to_int(rating_count_raw) if rating_count_raw is not None else text_rating_count
    like_count = _to_int(like_count_raw) if like_count_raw is not None else text_like_count
    share_count = _to_int(share_count_raw) if share_count_raw is not None else text_share_count

    # BBC Good Food hides rating averages/counts in a large JSON blob (`__POST_CONTENT__`) instead of
    # exposing stable aggregateRating markup. We use this as a domain-specific fallback so
    # metric_type=ratings policies can still enforce engagement thresholds.
    hostname = _normalized_hostname(source_url)
    if hostname.endswith("bbcgoodfood.com") and ((rating_count or 0) <= 0 or rating_value is None):
        payload_tag = soup.find("script", attrs={"id": "__POST_CONTENT__"})
        raw = payload_tag.string if payload_tag and payload_tag.string else ""
        match = BBC_USER_RATINGS_REGEX.search(raw)
        if match:
            parsed_avg = _to_float(match.group("avg"))
            parsed_total = _to_int(match.group("total"))
            if rating_value is None and parsed_avg is not None:
                rating_value = parsed_avg
            if (rating_count or 0) <= 0 and parsed_total is not None:
                rating_count = parsed_total
    return rating_value, rating_count, like_count, share_count


def _parse_tags_from_dom(soup: BeautifulSoup) -> list[str]:
    tags: list[str] = []
    for meta in soup.find_all("meta", attrs={"property": "article:tag"}):
        content = meta.get("content")
        if content:
            tags.append(content.strip())
    return [tag for tag in tags if tag]


def evaluate_page_compliance(
    html: str, source_url: str, parser_settings: Optional[dict[str, Any]] = None
) -> ComplianceCheckResult:
    soup = BeautifulSoup(html, "html.parser")
    profile = _effective_profile(source_url, parser_settings=parser_settings)
    reasons: list[str] = []

    robots_meta = soup.find("meta", attrs={"name": re.compile("^robots$", re.IGNORECASE)})
    robots_content = (robots_meta.get("content", "") if robots_meta else "").lower()
    if "noindex" in robots_content or "nofollow" in robots_content:
        reasons.append("robots-meta-blocked")

    canonical = soup.find("link", attrs={"rel": re.compile("canonical", re.IGNORECASE)})
    canonical_href = canonical.get("href", "").strip() if canonical else ""
    if canonical_href:
        canonical_host = _normalized_hostname(canonical_href)
        source_host = _normalized_hostname(source_url)
        if canonical_host and source_host and canonical_host != source_host and not canonical_host.endswith(
            f".{source_host}"
        ):
            reasons.append("canonical-host-mismatch")

    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    if not title:
        og_title = soup.find("meta", attrs={"property": "og:title"})
        if og_title and og_title.get("content"):
            title = og_title.get("content", "").strip()
    lowered_title = title.lower()
    blocked_keywords = profile.blocked_title_keywords if profile else (
        "privacy",
        "terms",
        "cookie",
        "login",
        "sign in",
    )
    if lowered_title and any(keyword in lowered_title for keyword in blocked_keywords):
        reasons.append("non-recipe-page")

    text = soup.get_text(" ", strip=True).lower()
    # Only apply "missing recipe markers" gating to pages that look like actual recipe URLs.
    # This keeps compliance checks focused on recipe content, while still allowing category/index pages
    # (often used as seeds) to be crawled for link discovery.
    if is_probable_recipe_url(source_url, parser_settings=parser_settings):
        markers = profile.required_text_markers if profile else ("ingredients", "instructions")
        missing_marker_count = sum(1 for marker in markers if marker not in text)
        jsonld_items = _extract_jsonld(soup)
        has_recipe_schema = _find_recipe_jsonld(jsonld_items) is not None
        has_recipe_like_schema = _find_recipe_like_jsonld(jsonld_items) is not None
        if markers and missing_marker_count == len(markers) and not (has_recipe_schema or has_recipe_like_schema):
            # Some sources (notably editorial pages using embedded recipe widgets) omit explicit "Ingredients" /
            # "Directions" headings but still contain structured ingredient/instruction blocks. For domain profiles,
            # treat a match on those selectors as sufficient evidence of a recipe-like page.
            has_selector_markers = False
            if profile:
                selectors = tuple(profile.ingredient_selectors) + tuple(profile.instruction_selectors)
                for selector in selectors:
                    if selector and soup.select_one(selector):
                        has_selector_markers = True
                        break
            if not has_selector_markers:
                reasons.append("missing-recipe-markers")

    if any(marker in text for marker in ("subscribe to continue", "members only", "subscriber-only")):
        reasons.append("paywall-detected")

    return ComplianceCheckResult(allowed=len(reasons) == 0, reasons=reasons)


def _parse_microdata(
    soup: BeautifulSoup, source_url: str, parser_settings: Optional[dict[str, Any]] = None
) -> Optional[ParsedRecipe]:
    title_tag = soup.find("h1")
    canonical_name = title_tag.get_text(" ", strip=True) if title_tag else ""
    for node in soup.select('[itemprop="name"]'):
        if canonical_name:
            break
        candidate = _extract_meta_value(node)
        if candidate:
            canonical_name = candidate
            break
    if not canonical_name:
        og_title = soup.find("meta", attrs={"property": "og:title"})
        canonical_name = _extract_meta_value(og_title) or ""
    if not canonical_name:
        return None
    ingredient_nodes = soup.select('[itemprop="recipeIngredient"]')
    ingredients = [
        _parse_ingredient_line(node.get_text(strip=True))
        for node in ingredient_nodes
        if node.get_text(strip=True)
    ]
    instruction_nodes = soup.select('[itemprop="recipeInstructions"]')
    instructions: list[str] = []
    for node in instruction_nodes:
        if node.name == "li":
            instructions.append(node.get_text(strip=True))
        else:
            instructions.extend([line.strip() for line in node.get_text("\n").splitlines() if line.strip()])
    if not ingredients or not instructions:
        return None
    rating_value, rating_count, like_count, share_count = _parse_signal_from_dom(
        soup, source_url, parser_settings=parser_settings
    )
    return ParsedRecipe(
        canonical_name=canonical_name,
        description=None,
        ingredients=ingredients,
        instructions=instructions,
        author=None,
        rating_value=rating_value,
        rating_count=rating_count,
        like_count=like_count,
        share_count=share_count,
        source_url="",
        tags=_parse_tags_from_dom(soup),
        parser_used="microdata",
    )


def _parse_domain_specific_dom(
    soup: BeautifulSoup, source_url: str, parser_settings: Optional[dict[str, Any]] = None
) -> Optional[ParsedRecipe]:
    profile = _effective_profile(source_url, parser_settings=parser_settings)
    if not profile:
        return None

    name_tag = soup.find("h1")
    canonical_name = name_tag.get_text(strip=True) if name_tag else ""
    if not canonical_name:
        og_title = soup.find("meta", attrs={"property": "og:title"})
        canonical_name = (og_title.get("content", "").strip() if og_title else "")
    if not canonical_name:
        return None

    ingredient_keywords = _keyword_setting(
        parser_settings,
        "ingredient_heading_keywords",
        ("ingredients", "for the cocktail", "what you'll need"),
    )
    instruction_keywords = _keyword_setting(
        parser_settings,
        "instruction_heading_keywords",
        ("directions", "method", "instructions", "preparation", "steps"),
    )

    def _try_imbibe_rte_recipe() -> tuple[list[dict[str, Any]], list[str]]:
        hostname = _normalized_hostname(source_url)
        if not hostname.endswith("imbibemagazine.com"):
            return [], []
        container = soup.select_one(".recipe__main-content")
        if not container:
            return [], []
        paragraphs = list(container.find_all("p"))
        if not paragraphs:
            return [], []

        # Imbibe's recipe template frequently encodes ingredient lines using `<br>` inside a paragraph,
        # followed by one or more paragraphs of method text. We avoid parsing editorial pages by
        # requiring multiple ingredient-like lines and at least one plausible instruction paragraph.
        ingredient_block_idx = None
        ingredient_lines: list[str] = []
        for idx, node in enumerate(paragraphs):
            text = node.get_text("\n", strip=True)
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            if len(lines) < 2:
                continue
            # Filter obvious non-ingredient rows (tools/glassware/garnish notes).
            cleaned = []
            for line in lines:
                lowered = line.lower()
                if lowered.startswith(("tools:", "tool:", "glass:", "glassware:", "garnish:", "serves:")):
                    continue
                cleaned.append(line)
            if len(cleaned) < 2:
                continue
            # Heuristic: at least one quantity marker OR a common cocktail unit appears.
            joined = " ".join(cleaned).lower()
            if not any(token in joined for token in (" oz", " ml", " dash", " dashes", " tsp", " tbsp", " cup", " cups")) and not re.search(r"\\b\\d", joined):
                continue
            ingredient_block_idx = idx
            ingredient_lines = cleaned
            break

        if ingredient_block_idx is None:
            return [], []

        ingredients_parsed = [_parse_ingredient_line(line) for line in ingredient_lines]

        instruction_lines: list[str] = []
        for node in paragraphs[ingredient_block_idx + 1 :]:
            # Stop at attribution/footer paragraphs.
            if node.find("em") is not None:
                break
            text = node.get_text(" ", strip=True)
            if not text:
                continue
            lowered = text.lower()
            if any(marker in lowered for marker in ("recipe by", "photo by", "advertisement")):
                break
            # Skip tool/glass notes that sometimes repeat after the ingredient block.
            if lowered.startswith(("tools:", "tool:", "glass:", "glassware:", "garnish:", "serves:")):
                continue
            instruction_lines.append(text)
            if len(instruction_lines) >= 6:
                break

        return ingredients_parsed, instruction_lines

    ingredients: list[dict[str, Any]] = []
    for selector in profile.ingredient_selectors:
        for node in soup.select(selector):
            text = node.get_text(" ", strip=True)
            if text:
                ingredients.append(_parse_ingredient_line(text))
        if ingredients:
            break
    if not ingredients:
        for text in _extract_section_list_items(soup, ingredient_keywords):
            ingredients.append(_parse_ingredient_line(text))
    if not ingredients:
        imbibe_ingredients, imbibe_instructions = _try_imbibe_rte_recipe()
        if imbibe_ingredients:
            ingredients = imbibe_ingredients

    instructions: list[str] = []
    for selector in profile.instruction_selectors:
        for node in soup.select(selector):
            text = node.get_text(" ", strip=True)
            if text:
                instructions.append(text)
        if instructions:
            break
    if not instructions:
        instructions = _extract_section_list_items(soup, instruction_keywords)
    if not instructions and not ingredients:
        # Ingredients fallback may have found nothing; attempt Imbibe RTE parsing.
        imbibe_ingredients, imbibe_instructions = _try_imbibe_rte_recipe()
        if imbibe_ingredients and imbibe_instructions:
            ingredients = imbibe_ingredients
            instructions = imbibe_instructions
    elif not instructions:
        # If we parsed ingredients via Imbibe RTE fallback above, try pairing it with RTE instructions.
        imbibe_ingredients, imbibe_instructions = _try_imbibe_rte_recipe()
        if imbibe_instructions and (ingredients == imbibe_ingredients or not imbibe_ingredients):
            instructions = imbibe_instructions

    if len(ingredients) < 2 or len(instructions) < 1:
        return None

    description = None
    og_desc = soup.find("meta", attrs={"property": "og:description"})
    if og_desc and og_desc.get("content"):
        description = og_desc.get("content", "").strip()
    rating_value, rating_count, like_count, share_count = _parse_signal_from_dom(
        soup, source_url, parser_settings=parser_settings
    )

    return ParsedRecipe(
        canonical_name=canonical_name,
        description=description,
        ingredients=ingredients,
        instructions=instructions,
        author=None,
        rating_value=rating_value,
        rating_count=rating_count,
        like_count=like_count,
        share_count=share_count,
        source_url=source_url,
        tags=_parse_tags_from_dom(soup),
        parser_used="domain_dom",
    )


def _parse_dom_fallback(
    soup: BeautifulSoup, source_url: str, parser_settings: Optional[dict[str, Any]] = None
) -> Optional[ParsedRecipe]:
    title = soup.find("h1")
    canonical_name = title.get_text(strip=True) if title else ""
    if not canonical_name:
        og_title = soup.find("meta", attrs={"property": "og:title"})
        if og_title and og_title.get("content"):
            canonical_name = og_title.get("content", "").strip()
    if not canonical_name:
        return None

    description = None
    og_desc = soup.find("meta", attrs={"property": "og:description"})
    if og_desc and og_desc.get("content"):
        description = og_desc.get("content", "").strip()

    ingredient_keywords = _keyword_setting(
        parser_settings,
        "ingredient_heading_keywords",
        ("ingredients", "for the cocktail", "what you'll need"),
    )
    instruction_keywords = _keyword_setting(
        parser_settings,
        "instruction_heading_keywords",
        ("directions", "method", "instructions", "preparation", "steps"),
    )

    ingredients: list[dict[str, Any]] = []
    ingredient_candidates = soup.select(
        ".ingredients li, [class*='ingredient'] li, [id*='ingredient'] li, .recipe-ingredients li"
    )
    for node in ingredient_candidates:
        text = node.get_text(" ", strip=True)
        if text:
            ingredients.append(_parse_ingredient_line(text))
    if not ingredients:
        for text in _extract_section_list_items(soup, ingredient_keywords):
            ingredients.append(_parse_ingredient_line(text))

    instructions: list[str] = []
    instruction_candidates = soup.select(
        ".instructions li, [class*='instruction'] li, [id*='instruction'] li, .method li, .directions li"
    )
    for node in instruction_candidates:
        text = node.get_text(" ", strip=True)
        if text:
            instructions.append(text)
    if not instructions:
        instructions = _extract_section_list_items(soup, instruction_keywords)

    if len(ingredients) < 2 or len(instructions) < 1:
        return None
    rating_value, rating_count, like_count, share_count = _parse_signal_from_dom(
        soup, source_url, parser_settings=parser_settings
    )
    fallback_class = classify_dom_fallback(soup, source_url, parser_settings=parser_settings)

    return ParsedRecipe(
        canonical_name=canonical_name,
        description=description,
        ingredients=ingredients,
        instructions=instructions,
        author=None,
        rating_value=rating_value,
        rating_count=rating_count,
        like_count=like_count,
        share_count=share_count,
        source_url="",
        tags=_parse_tags_from_dom(soup),
        parser_used="dom_fallback",
        fallback_class=fallback_class,
    )


def parse_recipe_from_html(
    html: str, source_url: str, parser_settings: Optional[dict[str, Any]] = None
) -> Optional[ParsedRecipe]:
    soup = BeautifulSoup(html, "html.parser")
    settings = parser_settings or {}

    enable_jsonld = _bool_setting(settings, "enable_jsonld", True)
    enable_domain_dom = _bool_setting(settings, "enable_domain_dom", True)
    enable_microdata = _bool_setting(settings, "enable_microdata", True)
    enable_dom_fallback = _bool_setting(settings, "enable_dom_fallback", True)
    prefer_domain_dom = _bool_setting(settings, "prefer_domain_dom", False)

    if prefer_domain_dom and enable_domain_dom:
        domain_first = _parse_domain_specific_dom(soup, source_url, parser_settings=settings)
        if domain_first:
            return _attach_extraction_confidence(domain_first, source_url, parser_settings=settings)

    items = _extract_jsonld(soup)
    recipe = None
    jsonld_parser_used = "jsonld"
    if enable_jsonld:
        recipe = _find_recipe_jsonld(items)
        if recipe is None:
            recipe = _find_recipe_like_jsonld(items)
            if recipe is not None:
                jsonld_parser_used = "jsonld_recipe_fields"
    if recipe:
        canonical_name = recipe.get("name") or ""
        description = recipe.get("description")
        ingredients = []
        for entry in recipe.get("recipeIngredient", []) or []:
            if isinstance(entry, str):
                ingredients.append(_parse_ingredient_line(entry))
            elif isinstance(entry, dict):
                # Some recipe publishers emit `recipeIngredient` as objects, not strings.
                # We accept a few common keys so we can still extract ingredient lines from JSON-LD.
                value = entry.get("name") or entry.get("text") or entry.get("ingredient")
                if value:
                    ingredients.append(_parse_ingredient_line(str(value)))
        instructions = _normalize_instructions(recipe.get("recipeInstructions"))
        author = None
        author_obj = recipe.get("author")
        if isinstance(author_obj, dict):
            author = author_obj.get("name")
        elif isinstance(author_obj, list):
            for entry in author_obj:
                if isinstance(entry, dict) and entry.get("name"):
                    author = entry.get("name")
                    break
        if not author:
            author_meta = soup.find("meta", attrs={"name": "author"})
            if author_meta and author_meta.get("content"):
                author = author_meta.get("content", "").strip()
        rating_value = None
        rating_count = None
        aggregate = recipe.get("aggregateRating") or {}
        if isinstance(aggregate, dict):
            rating_value = _to_float(aggregate.get("ratingValue"))
            rating_count = _to_int(aggregate.get("ratingCount") or aggregate.get("reviewCount"))
        like_count, share_count = _parse_interaction_stats(recipe.get("interactionStatistic"))
        tags = []
        if recipe.get("recipeCategory"):
            if isinstance(recipe["recipeCategory"], list):
                tags.extend([str(tag) for tag in recipe["recipeCategory"]])
            else:
                tags.append(str(recipe["recipeCategory"]))
        if recipe.get("recipeCuisine"):
            if isinstance(recipe["recipeCuisine"], list):
                tags.extend([str(tag) for tag in recipe["recipeCuisine"]])
            else:
                tags.append(str(recipe["recipeCuisine"]))
        dom_rating_value, dom_rating_count, dom_like_count, dom_share_count = _parse_signal_from_dom(
            soup, source_url, parser_settings=settings
        )
        rating_value = rating_value or dom_rating_value
        rating_count = rating_count or dom_rating_count
        like_count = like_count or dom_like_count
        share_count = share_count or dom_share_count
        tags.extend(_parse_tags_from_dom(soup))
        if canonical_name and ingredients and instructions:
            return _attach_extraction_confidence(
                ParsedRecipe(
                canonical_name=canonical_name,
                description=description,
                ingredients=ingredients,
                instructions=instructions,
                author=author,
                rating_value=rating_value,
                rating_count=rating_count,
                like_count=like_count,
                share_count=share_count,
                source_url=source_url,
                tags=[tag for tag in tags if tag],
                parser_used=jsonld_parser_used,
            ),
                source_url,
                parser_settings=settings,
            )
    if enable_domain_dom:
        domain_specific = _parse_domain_specific_dom(soup, source_url, parser_settings=settings)
        if domain_specific:
            return _attach_extraction_confidence(domain_specific, source_url, parser_settings=settings)
    if enable_microdata:
        micro = _parse_microdata(soup, source_url, parser_settings=settings)
        if micro:
            micro.source_url = source_url
            return _attach_extraction_confidence(micro, source_url, parser_settings=settings)
    if enable_dom_fallback:
        dom = _parse_dom_fallback(soup, source_url, parser_settings=settings)
        if dom:
            dom.source_url = source_url
            return _attach_extraction_confidence(dom, source_url, parser_settings=settings)
    return None


def _extract_links_from_sitemap_xml(
    content: str, max_links: int, parser_settings: Optional[dict[str, Any]] = None
) -> list[str]:
    links: list[str] = []
    try:
        root = ET.fromstring(content.strip())
    except ET.ParseError:
        return links
    for node in root.findall(".//{*}loc"):
        if not node.text:
            continue
        url = node.text.strip()
        if not url:
            continue
        if is_probable_recipe_url(url, parser_settings=parser_settings):
            links.append(url)
        if len(links) >= max_links:
            break
    return links


def _extract_sitemap_index_links(content: str, max_links: int) -> list[str]:
    links: list[str] = []
    try:
        root = ET.fromstring(content.strip())
    except ET.ParseError:
        return links
    for node in root.findall(".//{*}loc"):
        if not node.text:
            continue
        url = node.text.strip()
        if not url:
            continue
        links.append(url)
        if len(links) >= max_links:
            break
    return links


def discover_recipe_links(
    html: str, base_url: str, max_links: int = 10, parser_settings: Optional[dict[str, Any]] = None
) -> list[str]:
    stripped = html.lstrip()
    if stripped.startswith("<?xml") or "<urlset" in stripped[:2000] or "<sitemapindex" in stripped[:2000]:
        xml_links = _extract_links_from_sitemap_xml(
            stripped, max_links=max_links, parser_settings=parser_settings
        )
        if xml_links:
            return xml_links

    soup = BeautifulSoup(html, "html.parser")
    items = _extract_jsonld(soup)
    links: list[str] = []
    for item in items:
        if str(item.get("@type", "")).lower() == "itemlist":
            for element in item.get("itemListElement", []) or []:
                url = None
                if isinstance(element, dict):
                    url = element.get("url")
                    if not url and isinstance(element.get("item"), dict):
                        url = element["item"].get("url")
                if url:
                    links.append(urljoin(base_url, url))
    for anchor in soup.find_all("a", href=True):
        href = anchor.get("href") or ""
        if not href:
            continue
        if is_probable_recipe_url(href, parser_settings=parser_settings):
            links.append(urljoin(base_url, href))
    for meta in soup.find_all("meta"):
        content = meta.get("content") or ""
        if not content:
            continue
        if content.startswith("http") and is_probable_recipe_url(content, parser_settings=parser_settings):
            links.append(content)
    normalized = []
    seen = set()
    for link in links:
        cleaned = normalize_url(link)
        if cleaned in seen:
            continue
        seen.add(cleaned)
        normalized.append(cleaned)
        if len(normalized) >= max_links:
            break
    return normalized


async def fetch_html(url: str, client: Optional[httpx.AsyncClient] = None) -> str:
    headers = {"User-Agent": USER_AGENT}
    if client is None:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=headers) as session:
            response = await session.get(url)
            response.raise_for_status()
            return response.text
    response = await client.get(url, headers=headers)
    response.raise_for_status()
    return response.text


def classify_fetch_failure(exc: Exception) -> str:
    # Keep labels stable and low-cardinality; these feed policy calibration + alert thresholds.
    if isinstance(exc, httpx.TimeoutException):
        return "timeout"
    if isinstance(exc, httpx.ConnectError):
        return "connect-error"
    if isinstance(exc, httpx.NetworkError):
        return "network-error"
    if isinstance(exc, httpx.HTTPStatusError):
        status = int(getattr(exc.response, "status_code", 0) or 0)
        if status == 401:
            return "http-401"
        if status == 403:
            return "http-403"
        if status == 404:
            return "http-404"
        if status == 408:
            return "http-408"
        if status == 409:
            return "http-409"
        if status == 410:
            return "http-410"
        if status == 418:
            return "http-418"
        if status == 429:
            return "http-429"
        if 500 <= status < 600:
            return f"http-5xx"
        if status:
            return f"http-{status}"
        return "http-error"
    return "unknown-fetch-error"


def is_same_domain(url: str, base: str) -> bool:
    return (urlparse(url).hostname or "") == (urlparse(base).hostname or "")


async def _fetch_robots_sitemaps(base_url: str, client: httpx.AsyncClient) -> tuple[bool, list[str]]:
    robots_url = urljoin(base_url, "/robots.txt")
    sitemaps: list[str] = []
    disallow_all = False
    try:
        response = await client.get(robots_url)
        if response.status_code != 200:
            return True, []
        text = response.text
        user_agent_all = False
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            lower = line.lower()
            if lower.startswith("user-agent:"):
                user_agent_all = "*" in lower
            if lower.startswith("disallow:") and user_agent_all:
                disallow_value = line.split(":", 1)[1].strip()
                if disallow_value == "/":
                    disallow_all = True
            if lower.startswith("sitemap:"):
                sitemap = line.split(":", 1)[1].strip()
                if sitemap:
                    sitemaps.append(sitemap)
    except httpx.HTTPError:
        return True, []
    return (not disallow_all), sitemaps


async def discover_sitemap_links(
    base_url: str,
    client: httpx.AsyncClient,
    max_links: int = 200,
    parser_settings: Optional[dict[str, Any]] = None,
) -> list[str]:
    allowed, robots_sitemaps = await _fetch_robots_sitemaps(base_url, client)
    if not allowed:
        return []
    parsed = urlparse(base_url)
    root = f"{parsed.scheme}://{parsed.netloc}"
    candidate_sitemaps = [
        urljoin(root, "/sitemap.xml"),
        urljoin(root, "/sitemap_index.xml"),
    ]
    for sitemap in robots_sitemaps:
        if sitemap not in candidate_sitemaps:
            candidate_sitemaps.append(sitemap)
    discovered: list[str] = []
    seen = set()
    for sitemap_url in candidate_sitemaps:
        if len(discovered) >= max_links:
            break
        try:
            response = await client.get(sitemap_url)
            if response.status_code != 200:
                continue
            content = response.text
        except httpx.HTTPError:
            continue
        sitemap_links = _extract_sitemap_index_links(content, max_links=max_links)
        if sitemap_links and any(link.endswith(".xml") for link in sitemap_links):
            for child in sitemap_links:
                if len(discovered) >= max_links:
                    break
                if child in seen:
                    continue
                seen.add(child)
                try:
                    child_response = await client.get(child)
                    if child_response.status_code != 200:
                        continue
                    child_links = _extract_links_from_sitemap_xml(
                        child_response.text, max_links=max_links, parser_settings=parser_settings
                    )
                    for link in child_links:
                        if link not in seen:
                            discovered.append(link)
                            seen.add(link)
                        if len(discovered) >= max_links:
                            break
                except httpx.HTTPError:
                    continue
        else:
            child_links = _extract_links_from_sitemap_xml(
                content, max_links=max_links, parser_settings=parser_settings
            )
            for link in child_links:
                if link not in seen:
                    discovered.append(link)
                    seen.add(link)
                if len(discovered) >= max_links:
                    break
    return discovered[:max_links]


async def crawl_source(
    source_url: str,
    max_pages: int = 40,
    max_recipes: int = 20,
    crawl_depth: int = 2,
    max_links: int = 200,
    respect_robots: bool = True,
    parser_settings: Optional[dict[str, Any]] = None,
) -> CrawlResult:
    normalized_source = normalize_url(source_url)
    settings = parser_settings or {}
    discovered_urls: list[str] = []
    parsed_recipes: list[ParsedRecipe] = []
    parser_stats: dict[str, int] = {}
    confidence_buckets: dict[str, int] = {}
    fallback_class_counts: dict[str, int] = {}
    parse_failure_counts: dict[str, int] = {}
    compliance_reason_counts: dict[str, int] = {}
    compliance_rejections = 0
    errors: list[str] = []
    queue: deque = deque()
    queue.append((normalized_source, 0))
    visited: set[str] = set()

    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
        if respect_robots:
            allowed, _ = await _fetch_robots_sitemaps(normalized_source, client)
            if not allowed:
                return CrawlResult(
                    discovered_urls=[],
                    parsed_recipes=[],
                    parser_stats={},
                    confidence_buckets={},
                    fallback_class_counts={},
                    parse_failure_counts={},
                    compliance_rejections=1,
                    compliance_reason_counts={"robots-disallow-all": 1},
                    errors=["robots disallow all"],
                )

        # Avoid pulling in site-wide sitemap URLs when the operator provided a deep seed path
        # (collection/category pages). In practice, those seeds are meant to scope discovery.
        seed_path = (urlparse(normalized_source).path or "").strip()
        default_use_sitemaps = seed_path in {"", "/"}
        use_sitemaps = _bool_setting(settings, "use_sitemaps", default_use_sitemaps)
        if use_sitemaps:
            sitemap_links = await discover_sitemap_links(
                normalized_source,
                client,
                max_links=max_links,
                parser_settings=settings,
            )
            for link in sitemap_links:
                if len(queue) >= max_pages:
                    break
                normalized = normalize_url(link)
                if normalized and normalized not in visited and is_same_domain(normalized, normalized_source):
                    queue.append((normalized, 1))

        while queue and len(visited) < max_pages and len(parsed_recipes) < max_recipes:
            current_url, depth = queue.popleft()
            current_url = normalize_url(current_url)
            if not current_url or current_url in visited:
                continue
            visited.add(current_url)
            try:
                html = await fetch_html(current_url, client=client)
            except Exception as exc:  # noqa: BLE001
                fetch_failure = classify_fetch_failure(exc)
                errors.append(f"{current_url}: fetch_failed ({fetch_failure})")
                parse_failure_counts[f"fetch_failed:{fetch_failure}"] = (
                    parse_failure_counts.get(f"fetch_failed:{fetch_failure}", 0) + 1
                )
                continue
            compliance = evaluate_page_compliance(html, current_url, parser_settings=settings)
            if not compliance.allowed:
                compliance_rejections += 1
                for reason in compliance.reasons:
                    compliance_reason_counts[reason] = compliance_reason_counts.get(reason, 0) + 1
                reasons = ", ".join(compliance.reasons)
                errors.append(f"{current_url}: compliance check failed ({reasons})")
                continue
            parsed = parse_recipe_from_html(html, current_url, parser_settings=settings)
            if parsed:
                parsed.source_url = current_url
                min_extraction_confidence = _float_setting(settings, "min_extraction_confidence", 0.35)
                allow_low_confidence = _bool_setting(settings, "allow_low_confidence", False)
                if parsed.extraction_confidence < min_extraction_confidence and not allow_low_confidence:
                    recovered = parse_recipe_with_recovery(
                        html,
                        current_url,
                        parse_failure="low-confidence-parse",
                        parser_settings=settings,
                    )
                    if recovered and (
                        recovered.extraction_confidence >= min_extraction_confidence or allow_low_confidence
                    ):
                        parsed = recovered
                        parsed.source_url = current_url
                    else:
                        parse_failure = "low-confidence-parse"
                        parse_failure_counts[parse_failure] = parse_failure_counts.get(parse_failure, 0) + 1
                        errors.append(
                            f"{current_url}: parse failed ({parse_failure}:{parsed.extraction_confidence})"
                        )
                        continue
                parser_stats[parsed.parser_used] = parser_stats.get(parsed.parser_used, 0) + 1
                bucket = _extraction_confidence_bucket(parsed.extraction_confidence)
                confidence_buckets[bucket] = confidence_buckets.get(bucket, 0) + 1
                if parsed.parser_used == "dom_fallback":
                    fallback_class = parsed.fallback_class or "unclassified"
                    fallback_class_counts[fallback_class] = fallback_class_counts.get(fallback_class, 0) + 1
                parsed_recipes.append(parsed)
                discovered_urls.append(current_url)
                if len(parsed_recipes) >= max_recipes:
                    break
                continue
            parse_failure = classify_parse_failure(html, current_url, parser_settings=settings)
            recovered = parse_recipe_with_recovery(
                html,
                current_url,
                parse_failure=parse_failure,
                parser_settings=settings,
            )
            if recovered:
                recovered.source_url = current_url
                parser_stats[recovered.parser_used] = parser_stats.get(recovered.parser_used, 0) + 1
                bucket = _extraction_confidence_bucket(recovered.extraction_confidence)
                confidence_buckets[bucket] = confidence_buckets.get(bucket, 0) + 1
                if recovered.parser_used.endswith("dom_fallback"):
                    fallback_class = recovered.fallback_class or "unclassified"
                    fallback_class_counts[fallback_class] = fallback_class_counts.get(fallback_class, 0) + 1
                parsed_recipes.append(recovered)
                discovered_urls.append(current_url)
                if len(parsed_recipes) >= max_recipes:
                    break
                continue
            parse_failure_counts[parse_failure] = parse_failure_counts.get(parse_failure, 0) + 1
            errors.append(f"{current_url}: parse failed ({parse_failure})")
            if depth >= crawl_depth:
                continue
            links = discover_recipe_links(
                html,
                current_url,
                max_links=max_links,
                parser_settings=settings,
            )
            for link in links:
                if len(visited) + len(queue) >= max_pages:
                    break
                normalized = normalize_url(link)
                if not normalized or normalized in visited:
                    continue
                if not is_same_domain(normalized, normalized_source):
                    continue
                queue.append((normalized, depth + 1))

    return CrawlResult(
        discovered_urls=list(dict.fromkeys(discovered_urls)),
        parsed_recipes=parsed_recipes,
        parser_stats=parser_stats,
        confidence_buckets=confidence_buckets,
        fallback_class_counts=fallback_class_counts,
        parse_failure_counts=parse_failure_counts,
        compliance_rejections=compliance_rejections,
        compliance_reason_counts=compliance_reason_counts,
        errors=errors,
    )
