# Recipe Sources Policy

## Tier A (explicit ratings or reviews on recipe pages)
- Allrecipes (star ratings + review counts)
- BBC Good Food (star ratings)
- Food.com (reviews / rating counts)

## Tier B (pervasiveness across the internet)
- Difford's Guide (most-viewed + hall-of-fame signals; pervasiveness handled by cross-source matches)
- Imbibe Magazine (editorial; require pervasiveness across sources)
- Punch (editorial; require pervasiveness across sources)

## Requirements
- For Tier A sources, recipes must include rating/like/share/review signals or meet the minimum rating count.
- For Tier B sources, recipes must be corroborated by at least one other source in the database (pervasiveness).

## Signals Captured
- `rating_value` (0–5)
- `rating_count` (may reflect review counts when only reviews are exposed)
- `like_count`
- `share_count`

These signals are stored on ingestion/harvest payloads and used to compute a quality score.

## Per-Source Normalizers
- `allrecipes.com`: tuned selectors for structured ingredient/instruction blocks and review bar counters.
- `bbcgoodfood.com`: tuned selectors for `recipe__ingredients` and `recipe__method-steps` structures.
- `food.com`: tuned selectors for recipe ingredient and directions list structures.
- `diffordsguide.com`: tuned selectors for cocktail ingredient/method sections with pervasiveness-first scoring.
- `imbibemagazine.com`: tuned selectors for editorial recipe widgets (WPRM/MV-style ingredients and instructions).
- `punchdrink.com`: tuned selectors for editorial recipe layouts and share counters.

Fallback extraction still runs for all domains:
- JSON-LD recipe payloads.
- microdata recipe attributes.
- page text pattern matching for ratings/reviews/likes/shares.

## Compliance Verification (enforced during crawling)
- `robots.txt` disallow-all blocks halt crawl for that source when `respect_robots=true`.
- `<meta name="robots">` with `noindex`/`nofollow` is rejected.
- Canonical host mismatch against source host is rejected.
- Non-recipe page detection blocks pages with legal/account title markers (privacy/terms/cookie/login).
- Paywall markers (for example, “subscribe to continue”) are rejected.
- Missing recipe markers (no ingredient/method signals) are rejected.

## Admin Management
- Source policies are managed in Admin → Source Policies.
- Settings include `metric_type`, minimum ratings, and review policy.
- Parser behavior can be overridden per source via `parser_settings` JSON.
- Alert thresholds can be set per source via `alert_settings` JSON.

## Parser Settings (per source policy)
- `ingredient_selectors`: override CSS selectors used for ingredient extraction.
- `instruction_selectors`: override CSS selectors used for instruction extraction.
- `rating_value_selectors`: override CSS selectors for rating value.
- `rating_count_selectors`: override CSS selectors for rating/review counts.
- `like_count_selectors`: override CSS selectors for social like counts.
- `share_count_selectors`: override CSS selectors for social share counts.
- `required_text_markers`: override compliance marker checks.
- `blocked_title_keywords`: override non-recipe title keywords.
- `recipe_path_hints`: override URL path hints for recipe discovery.
- `prefer_domain_dom`: prioritize per-domain DOM parsing before JSON-LD.
- `enable_jsonld`, `enable_domain_dom`, `enable_microdata`, `enable_dom_fallback`: toggle parser stages.

## Alert Settings (per source policy)
- `max_failure_rate` (default `0.35`)
- `max_retry_queue` (default `10`)
- `max_compliance_rejections` (default `5`)
- `max_parser_fallback_rate` (default `0.6`)
- `max_avg_attempt_count` (default `2.0`)

These thresholds are evaluated in Admin → Crawler Ops telemetry.

## Crawl Settings (per source policy)
- `seed_urls`: starting points for automated discovery (one per line).
- `crawl_depth`: link depth from each seed URL (default 2).
- `max_pages`: maximum pages fetched per sweep (default 40).
- `max_recipes`: maximum recipes ingested per sweep (default 20).
- `crawl_interval_minutes`: cadence between sweeps (default 240).
- `respect_robots`: skip sources that disallow crawling (default true).

## Default Seed URLs (verify/adjust)
- Allrecipes: `https://www.allrecipes.com/recipes/77/drinks/`
- BBC Good Food: `https://www.bbcgoodfood.com/recipes/collection/cocktail-recipes`
- Food.com: `https://www.food.com/search/cocktail`
- Difford's Guide: `https://www.diffordsguide.com/cocktails/search`
- Imbibe Magazine: `https://imbibemagazine.com/category/recipes/`
- Punch: `https://punchdrink.com/` (enables sitemap discovery) and `https://punchdrink.com/recipes/feed/`
