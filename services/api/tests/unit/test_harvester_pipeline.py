import asyncio

import pytest

from app.domain.harvester_pipeline import (
    build_recovery_parser_settings,
    classify_parse_failure,
    crawl_source,
    discover_recipe_links,
    evaluate_page_compliance,
    is_probable_recipe_url,
    normalize_url,
    parse_recipe_from_html,
    parse_recipe_with_recovery,
)


def test_parse_recipe_from_jsonld():
    html = """
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Recipe",
          "name": "Test Sour",
          "recipeIngredient": ["2 oz gin", "1 oz lemon juice", "0.75 oz simple syrup"],
          "recipeInstructions": ["Shake", "Strain"],
          "aggregateRating": {"ratingValue": "4.6", "ratingCount": "120"}
        }
        </script>
      </head>
      <body></body>
    </html>
    """
    parsed = parse_recipe_from_html(html, "https://example.com/recipe/test-sour")
    assert parsed is not None
    assert parsed.canonical_name == "Test Sour"
    assert len(parsed.ingredients) == 3
    assert parsed.rating_count == 120
    assert parsed.parser_used == "jsonld"
    assert parsed.extraction_confidence >= 0.7


def test_parse_recipe_from_jsonld_supports_ingredient_objects():
    html = """
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Recipe",
          "name": "Object Ingredient Sour",
          "recipeIngredient": [
            {"ingredient": "2 oz rye whiskey"},
            {"ingredient": "1/2 oz Punt e Mes"},
            {"ingredient": "1/2 oz maraschino liqueur"}
          ],
          "recipeInstructions": [{"@type": "HowToStep", "text": "Stir with ice."}]
        }
        </script>
      </head>
      <body></body>
    </html>
    """
    parsed = parse_recipe_from_html(html, "https://imbibemagazine.com/recipe/red-hook-recipe/")
    assert parsed is not None
    assert parsed.canonical_name == "Object Ingredient Sour"
    assert len(parsed.ingredients) == 3
    assert parsed.instructions
    assert parsed.parser_used in {"jsonld", "jsonld_recipe_fields"}


def test_bbc_post_content_user_ratings_fallback_populates_engagement_signals():
    html = """
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Recipe",
          "name": "BBC Fallback Cocktail",
          "recipeIngredient": ["2 oz gin", "1 oz lemon juice"],
          "recipeInstructions": ["Shake"],
          "aggregateRating": {}
        }
        </script>
        <script id="__POST_CONTENT__" type="application/json">
          {"userRatings":{"avg":4.2,"total":61}}
        </script>
      </head>
      <body></body>
    </html>
    """
    parsed = parse_recipe_from_html(html, "https://www.bbcgoodfood.com/recipes/bbc-fallback")
    assert parsed is not None
    assert parsed.rating_value == pytest.approx(4.2, rel=1e-6)
    assert parsed.rating_count == 61


def test_parse_imbibe_rte_recipe_template_fallback():
    html = """
    <html>
      <body>
        <h1>Torero Cocktail</h1>
        <div class="recipe__main-content">
          <p>
            1 oz mezcal<br/>
            1/2 oz Cherry Heering<br/>
            3/4 oz fresh grapefruit juice<br/>
            Tools: shaker, strainer
          </p>
          <p>Shake all ingredients together with ice, then strain.</p>
          <p><em>Attribution text that should be ignored.</em></p>
        </div>
      </body>
    </html>
    """
    parsed = parse_recipe_from_html(html, "https://imbibemagazine.com/recipe/torero-cocktail/")
    assert parsed is not None
    assert parsed.canonical_name == "Torero Cocktail"
    assert len(parsed.ingredients) >= 2
    assert len(parsed.instructions) >= 1
    assert parsed.parser_used in {"domain_dom", "dom_fallback"}


def test_parse_recipe_from_dom_fallback():
    html = """
    <html>
      <head>
        <meta property="og:title" content="Fallback Collins" />
      </head>
      <body>
        <h1>Fallback Collins</h1>
        <div class="ingredients">
          <ul>
            <li>2 oz gin</li>
            <li>1 oz lemon juice</li>
            <li>0.75 oz simple syrup</li>
          </ul>
        </div>
        <div class="instructions">
          <ol>
            <li>Shake with ice</li>
            <li>Strain into glass</li>
          </ol>
        </div>
      </body>
    </html>
    """
    parsed = parse_recipe_from_html(html, "https://example.com/recipes/fallback-collins")
    assert parsed is not None
    assert parsed.canonical_name == "Fallback Collins"
    assert len(parsed.ingredients) == 3
    assert len(parsed.instructions) == 2
    assert parsed.fallback_class in {"generic-dom-pattern", "domain-selector-mismatch", "jsonld-incomplete"}


def test_parse_recipe_from_microdata_rating():
    html = """
    <html>
      <body>
        <h1 itemprop="name">Rated Sour</h1>
        <div itemprop="recipeIngredient">2 oz gin</div>
        <div itemprop="recipeIngredient">1 oz lemon juice</div>
        <div itemprop="recipeIngredient">0.75 oz syrup</div>
        <div itemprop="recipeInstructions">Shake</div>
        <div itemprop="aggregateRating">
          <span itemprop="ratingValue">4.8</span>
          <span itemprop="ratingCount">230</span>
        </div>
      </body>
    </html>
    """
    parsed = parse_recipe_from_html(html, "https://example.com/recipes/rated-sour")
    assert parsed is not None
    assert parsed.rating_value == 4.8
    assert parsed.rating_count == 230


def test_parse_recipe_from_jsonld_recipe_fields_fallback():
    html = """
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          "name": "Gridiron",
          "recipeIngredient": ["2 oz whiskey", "2 oz soda water"],
          "recipeInstructions": ["Build over ice", "Top with soda"]
        }
        </script>
      </head>
      <body><h1>Gridiron</h1></body>
    </html>
    """
    parsed = parse_recipe_from_html(html, "https://punchdrink.com/recipes/gridiron/")
    assert parsed is not None
    assert parsed.canonical_name == "Gridiron"
    assert parsed.parser_used == "jsonld_recipe_fields"
    assert len(parsed.ingredients) == 2
    assert len(parsed.instructions) == 2


def test_parse_microdata_prefers_h1_title_over_meta_itemprop_name():
    html = """
    <html>
      <body>
        <meta itemprop="name" content="" />
        <h1>The Gridiron</h1>
        <div itemprop="recipeIngredient">2 oz whiskey</div>
        <div itemprop="recipeIngredient">2 oz soda water</div>
        <ol itemprop="recipeInstructions">
          <li>Build over ice</li>
          <li>Top with soda</li>
        </ol>
      </body>
    </html>
    """
    parsed = parse_recipe_from_html(html, "https://punchdrink.com/recipes/gridiron/")
    assert parsed is not None
    assert parsed.canonical_name == "The Gridiron"
    assert parsed.parser_used in {"microdata", "jsonld_recipe_fields"}


def test_sitemap_discovery_and_normalize():
    xml = """
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/recipes/test-sour</loc></url>
      <url><loc>https://example.com/about</loc></url>
    </urlset>
    """
    links = discover_recipe_links(xml, "https://example.com", max_links=10)
    assert links == ["https://example.com/recipes/test-sour"]
    assert normalize_url("https://example.com/recipes/test-sour?x=1#y") == "https://example.com/recipes/test-sour"
    assert is_probable_recipe_url("https://example.com/recipes/test-sour")


def test_probable_recipe_url_rejects_domain_specific_index_pages():
    assert is_probable_recipe_url("https://punchdrink.com/recipe-archives/?spirits=Gin") is False
    assert is_probable_recipe_url("https://www.diffordsguide.com/cocktails/search") is False
    assert is_probable_recipe_url("https://www.diffordsguide.com/cocktails/recipe/2107/negroni") is True
    assert is_probable_recipe_url("https://www.bbcgoodfood.com/recipes/collection/cocktail-recipes") is False
    assert is_probable_recipe_url("https://www.bbcgoodfood.com/recipes/thai-tea") is True


def test_parse_domain_specific_signals_with_social_counts():
    html = """
    <html>
      <head>
        <title>Negroni | Allrecipes</title>
      </head>
      <body>
        <h1>Negroni</h1>
        <ul id="mntl-structured-ingredients_1-0">
          <li>1 oz gin</li>
          <li>1 oz Campari</li>
          <li>1 oz sweet vermouth</li>
        </ul>
        <ol id="recipe__steps-content_1-0">
          <li>Stir with ice.</li>
          <li>Strain over fresh ice.</li>
        </ol>
        <div class="mntl-recipe-review-bar__rating">4.7</div>
        <div class="mntl-recipe-review-bar__rating-count">345 ratings</div>
        <div data-like-count="1200"></div>
        <div data-share-count="230"></div>
      </body>
    </html>
    """
    parsed = parse_recipe_from_html(html, "https://www.allrecipes.com/recipe/12345/negroni/")
    assert parsed is not None
    assert parsed.rating_value == 4.7
    assert parsed.rating_count == 345
    assert parsed.like_count == 1200
    assert parsed.share_count == 230
    assert parsed.parser_used in {"domain_dom", "jsonld"}


def test_compliance_blocks_noindex_and_non_recipe_title():
    html = """
    <html>
      <head>
        <title>Privacy Policy | Allrecipes</title>
        <meta name="robots" content="noindex,nofollow" />
      </head>
      <body>
        <p>Legal content only.</p>
      </body>
    </html>
    """
    result = evaluate_page_compliance(html, "https://www.allrecipes.com/privacy-policy")
    assert result.allowed is False
    assert "robots-meta-blocked" in result.reasons
    assert "non-recipe-page" in result.reasons


def test_parse_recipe_prefers_domain_dom_when_enabled():
    html = """
    <html>
      <body>
        <h1>Domain Preferred Sour</h1>
        <ul id="mntl-structured-ingredients_1-0">
          <li>2 oz gin</li>
          <li>1 oz lemon juice</li>
        </ul>
        <ol id="recipe__steps-content_1-0">
          <li>Shake with ice.</li>
        </ol>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Recipe",
          "name": "JSON-LD Sour",
          "recipeIngredient": ["2 oz gin", "1 oz lemon juice"],
          "recipeInstructions": ["Shake"]
        }
        </script>
      </body>
    </html>
    """
    parsed = parse_recipe_from_html(
        html,
        "https://www.allrecipes.com/recipe/123/domain-preferred-sour",
        {"prefer_domain_dom": True},
    )
    assert parsed is not None
    assert parsed.canonical_name == "Domain Preferred Sour"
    assert parsed.parser_used == "domain_dom"


def test_compliance_uses_overridden_text_markers():
    html = """
    <html>
      <head><title>Recipe Candidate</title></head>
      <body>
        <h1>Some Recipe</h1>
        <p>ingredients and directions are present</p>
      </body>
    </html>
    """
    result = evaluate_page_compliance(
        html,
        "https://www.allrecipes.com/recipe/123/test",
        {"required_text_markers": ["special-marker"]},
    )
    assert result.allowed is False
    assert "missing-recipe-markers" in result.reasons


def test_compliance_allows_recipe_like_jsonld_without_text_markers():
    html = """
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          "name": "Gridiron",
          "recipeIngredient": ["2 oz whiskey", "2 oz soda water"],
          "recipeInstructions": ["Build over ice", "Top with soda"]
        }
        </script>
      </head>
      <body>
        <h1>Gridiron</h1>
      </body>
    </html>
    """
    result = evaluate_page_compliance(html, "https://punchdrink.com/recipes/gridiron/")
    assert result.allowed is True
    assert "missing-recipe-markers" not in result.reasons


def test_compliance_allows_non_recipe_seed_pages_without_recipe_markers_for_link_discovery():
    html = """
    <html>
      <head><title>Category: Cocktails</title></head>
      <body>
        <h1>Cocktail Recipes</h1>
        <p>Browse our latest cocktail coverage.</p>
      </body>
    </html>
    """
    # Imbibe category pages are commonly used as harvest seeds and should not be rejected
    # for missing recipe markers; they exist for link discovery.
    result = evaluate_page_compliance(html, "https://imbibemagazine.com/category/recipes/")
    assert result.allowed is True
    assert "missing-recipe-markers" not in result.reasons


def test_classify_parse_failure_domain_selector_mismatch():
    html = """
    <html>
      <head><title>Recipe Page</title></head>
      <body>
        <h1>Recipe Candidate</h1>
        <div class="ingredients"><ul><li>2 oz gin</li></ul></div>
        <div class="instructions"><ol><li>Shake</li></ol></div>
      </body>
    </html>
    """
    failure = classify_parse_failure(
        html,
        "https://www.allrecipes.com/recipe/123/example",
    )
    assert failure in {"domain-selector-mismatch", "domain-ingredients-sparse"}


def test_crawl_source_rejects_low_confidence_parse(monkeypatch):
    html = """
    <html>
      <head><title>Fallback Cocktail</title></head>
      <body>
        <h1>Fallback Cocktail</h1>
        <p>ingredients instructions</p>
        <div class="ingredients">
          <ul>
            <li>2 oz gin</li>
            <li>1 oz vermouth</li>
            <li>1 dash bitters</li>
          </ul>
        </div>
        <div class="instructions">
          <ol>
            <li>Stir with ice.</li>
            <li>Strain and serve.</li>
          </ol>
        </div>
      </body>
    </html>
    """

    async def _fake_fetch_html(_url, client=None):
        return html

    async def _fake_fetch_robots(_base_url, _client):
        return True, []

    async def _fake_discover_sitemap(*_args, **_kwargs):
        return []

    monkeypatch.setattr("app.domain.harvester_pipeline.fetch_html", _fake_fetch_html)
    monkeypatch.setattr("app.domain.harvester_pipeline._fetch_robots_sitemaps", _fake_fetch_robots)
    monkeypatch.setattr("app.domain.harvester_pipeline.discover_sitemap_links", _fake_discover_sitemap)

    result = asyncio.run(
        crawl_source(
            "https://example.com/recipes/fallback-cocktail",
            max_pages=2,
            max_recipes=2,
            parser_settings={
                "enable_jsonld": False,
                "enable_domain_dom": False,
                "enable_microdata": False,
                "enable_dom_fallback": True,
                "min_extraction_confidence": 0.95,
            },
        )
    )
    assert result.parsed_recipes == []
    assert result.parse_failure_counts.get("low-confidence-parse", 0) == 1


def test_parse_recipe_with_recovery_from_domain_selector_mismatch():
    html = """
    <html>
      <body>
        <h1>Recovery Sour</h1>
        <div class="ingredients">
          <ul>
            <li>2 oz gin</li>
            <li>1 oz lemon juice</li>
            <li>0.75 oz simple syrup</li>
          </ul>
        </div>
        <div class="directions">
          <ol>
            <li>Shake with ice.</li>
            <li>Strain into chilled glass.</li>
          </ol>
        </div>
      </body>
    </html>
    """
    parser_settings = {
        "enable_jsonld": False,
        "enable_domain_dom": False,
        "enable_microdata": False,
        "enable_dom_fallback": False,
    }
    initial = parse_recipe_from_html(
        html,
        "https://www.allrecipes.com/recipe/123/recovery-sour",
        parser_settings=parser_settings,
    )
    assert initial is None

    failure = classify_parse_failure(
        html,
        "https://www.allrecipes.com/recipe/123/recovery-sour",
        parser_settings=parser_settings,
    )
    recovered = parse_recipe_with_recovery(
        html,
        "https://www.allrecipes.com/recipe/123/recovery-sour",
        parse_failure=failure,
        parser_settings=parser_settings,
    )
    assert recovered is not None
    assert recovered.parser_used.startswith("recovery_")
    assert len(recovered.ingredients) >= 2
    assert len(recovered.instructions) >= 1


def test_build_recovery_parser_settings_relaxes_low_confidence_threshold():
    settings, actions = build_recovery_parser_settings(
        parse_failure="low-confidence-parse",
        source_url="https://www.allrecipes.com/recipe/123/recovery-sour",
        parser_settings={"min_extraction_confidence": 0.42},
    )
    assert "relax-confidence-threshold" in actions
    assert settings["min_extraction_confidence"] == pytest.approx(0.32, rel=1e-6)
    assert settings["penalize_missing_engagement_signals"] is False


def test_heading_sections_are_parsed_when_selectors_missing():
    html = """
    <html>
      <body>
        <h1>Heading Sour</h1>
        <section>
          <h2>Ingredients</h2>
          <ul>
            <li>2 oz gin</li>
            <li>1 oz lemon juice</li>
            <li>0.75 oz simple syrup</li>
          </ul>
        </section>
        <section>
          <h2>Directions</h2>
          <ol>
            <li>Shake with ice.</li>
            <li>Strain into a coupe.</li>
          </ol>
        </section>
      </body>
    </html>
    """
    parsed = parse_recipe_from_html(html, "https://www.allrecipes.com/recipe/heading-sour")
    assert parsed is not None
    assert parsed.canonical_name == "Heading Sour"
    assert len(parsed.ingredients) >= 2
    assert len(parsed.instructions) >= 1


def test_parse_compact_rating_and_social_counts():
    html = """
    <html>
      <body>
        <h1>Compact Count Sour</h1>
        <section>
          <h2>Ingredients</h2>
          <ul>
            <li>2 oz gin</li>
            <li>1 oz lemon juice</li>
            <li>0.75 oz syrup</li>
          </ul>
        </section>
        <section>
          <h2>Directions</h2>
          <ol>
            <li>Shake with ice.</li>
            <li>Strain into chilled glass.</li>
          </ol>
        </section>
        <div aria-label="Rated 4.7 out of 5 stars">4.7 out of 5</div>
        <p>1.2k ratings</p>
        <p>3.4k likes</p>
        <p>860 shares</p>
      </body>
    </html>
    """
    parsed = parse_recipe_from_html(html, "https://www.allrecipes.com/recipe/compact-count-sour")
    assert parsed is not None
    assert parsed.rating_value == 4.7
    assert parsed.rating_count == 1200
    assert parsed.like_count == 3400
    assert parsed.share_count == 860


def test_classify_parse_failure_instruction_structure_mismatch():
    html = """
    <html>
      <body>
        <h1>Mismatch Sour</h1>
        <ul id="mntl-structured-ingredients_1-0">
          <li>2 oz gin</li>
          <li>1 oz lemon juice</li>
        </ul>
        <p>No method section exists on this page.</p>
      </body>
    </html>
    """
    failure = classify_parse_failure(
        html,
        "https://www.allrecipes.com/recipe/999/mismatch-sour",
    )
    assert failure in {"instruction-structure-mismatch", "domain-instructions-sparse"}
