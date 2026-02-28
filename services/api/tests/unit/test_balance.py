from app.domain.balance import apply_fix, compute_metrics, suggest_fixes


def test_compute_metrics_includes_spirit_ratio():
    metrics = compute_metrics(
        [
            {"name": "gin", "quantity": 2.0, "unit": "oz"},
            {"name": "lemon juice", "quantity": 0.75, "unit": "oz"},
            {"name": "simple syrup", "quantity": 0.75, "unit": "oz"},
        ],
        method="shake",
    )
    assert metrics["abv_estimate"] > 10
    assert metrics["spirit_ratio"] > 0
    assert metrics["acidity_index"] > 0
    assert metrics["sweetness_index"] > 0


def test_apply_fix_too_sweet_reduces_sweetener():
    ingredients = [
        {"name": "simple syrup", "quantity": 1.0, "unit": "oz"},
        {"name": "gin", "quantity": 2.0, "unit": "oz"},
    ]
    adjusted = apply_fix(ingredients, "too_sweet")
    syrup = next(item for item in adjusted if item["name"] == "simple syrup")
    assert syrup["quantity"] < 1.0


def test_suggest_fixes_adds_structural_hints():
    suggestions = suggest_fixes(
        {
            "abv_estimate": 24.0,
            "sweetness_index": 1.4,
            "acidity_index": 0.2,
            "bitterness_index": 0.2,
            "spirit_ratio": 0.7,
        },
        "too_sweet",
    )
    actions = {item["action"] for item in suggestions}
    assert "add_citrus" in actions
    assert "increase_dilution" in actions
