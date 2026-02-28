from app.domain.studio_generator import build_recipe


def test_build_recipe_applies_include_and_exclude_constraints():
    recipe = build_recipe(
        "sour",
        {
            "include_ingredients": ["tequila"],
            "exclude_ingredients": ["simple syrup"],
        },
    )
    ingredient_names = [item["name"] for item in recipe["ingredients"]]
    assert "tequila" in ingredient_names
    assert "simple syrup" not in ingredient_names


def test_build_recipe_uses_available_ingredients_when_present():
    recipe = build_recipe(
        "collins",
        {
            "available_ingredients": ["gin", "soda water"],
        },
    )
    ingredient_names = {item["name"] for item in recipe["ingredients"]}
    assert "gin" in ingredient_names
    assert "soda water" in ingredient_names
