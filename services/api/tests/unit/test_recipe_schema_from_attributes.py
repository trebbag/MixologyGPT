import uuid
from types import SimpleNamespace

from app.schemas.recipe import RecipeIngredient, RecipeRead


def test_recipe_ingredient_supports_from_attributes():
    # SQLAlchemy models are attribute-based objects; schemas must validate from attributes.
    obj = SimpleNamespace(name="Gin", quantity=2.0, unit="oz", note=None)
    parsed = RecipeIngredient.model_validate(obj)
    assert parsed.name == "Gin"
    assert parsed.quantity == 2.0
    assert parsed.unit == "oz"


def test_recipe_read_validates_nested_ingredients_from_attributes():
    ingredient = SimpleNamespace(name="Gin", quantity=2.0, unit="oz", note="London dry")
    recipe = SimpleNamespace(
        id=uuid.uuid4(),
        canonical_name="Gin Test",
        description=None,
        ingredient_rows=[ingredient],
        instructions=["Stir with ice", "Strain"],
        glassware_id=None,
        ice_style=None,
        tags=["test"],
        review_status="pending",
        quality_label=None,
    )
    payload = RecipeRead.model_validate(recipe).model_dump()
    assert payload["canonical_name"] == "Gin Test"
    assert "ingredient_rows" in payload
    assert payload["ingredient_rows"][0]["name"] == "Gin"

    # API responses may serialize using the field's serialization_alias.
    payload_alias = RecipeRead.model_validate(recipe).model_dump(by_alias=True)
    assert "ingredients" in payload_alias
    assert payload_alias["ingredients"][0]["name"] == "Gin"
