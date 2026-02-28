from app.domain.harvester import (
    SourcePolicy,
    compute_quality_score,
    ingredient_jaccard_similarity,
    normalize_ingredient_name,
    normalize_recipe_name,
)


def test_normalizers_are_stable():
    assert normalize_recipe_name("  Negroni (Classic)  ") == "negroni classic"
    assert normalize_ingredient_name(" Fresh-Lime Juice ") == "fresh lime juice"


def test_jaccard_similarity():
    a = {"gin", "lemon juice", "simple syrup"}
    b = {"gin", "lemon juice", "sugar syrup"}
    similarity = ingredient_jaccard_similarity(a, b)
    assert similarity > 0.4
    assert similarity < 1.0


def test_quality_score_increases_with_signals():
    policy = SourcePolicy(
        name="Allrecipes",
        domain="allrecipes.com",
        metric_type="ratings",
        min_rating_count=10,
        min_rating_value=0.0,
        review_policy="manual",
        is_active=True,
    )
    low = compute_quality_score(
        policy=policy,
        ingredient_count=2,
        instruction_count=1,
        popularity_score=0.2,
        rating_count=1,
        rating_value=3.0,
        pervasiveness_count=0,
    )
    high = compute_quality_score(
        policy=policy,
        ingredient_count=6,
        instruction_count=5,
        popularity_score=2.0,
        rating_count=200,
        rating_value=4.8,
        pervasiveness_count=3,
    )
    assert high > low
