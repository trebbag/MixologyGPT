from __future__ import annotations

from typing import Any


DEFAULT_BASE_BY_STYLE = {
    "sour": "gin",
    "old fashioned": "whiskey",
    "negroni": "gin",
    "collins": "gin",
}


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _to_float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _pick_base_spirit(template: str, constraints: dict[str, Any]) -> str:
    include = [str(name).strip().lower() for name in constraints.get("include_ingredients", []) if str(name).strip()]
    if include:
        return include[0]
    style_base = DEFAULT_BASE_BY_STYLE.get(template, "gin")
    if constraints.get("abv_target") is not None and _to_float(constraints.get("abv_target"), 0.0) <= 18:
        return "fortified wine"
    return style_base


def _sweet_acid_adjustments(constraints: dict[str, Any]) -> tuple[float, float]:
    sweetness_target = _clamp(_to_float(constraints.get("sweetness_target"), 5.0), 0.0, 10.0)
    acidity_target = _clamp(_to_float(constraints.get("acidity_target"), 5.0), 0.0, 10.0)
    sweet_scale = 0.55 + (sweetness_target / 10.0) * 0.9
    acid_scale = 0.55 + (acidity_target / 10.0) * 0.9
    return sweet_scale, acid_scale


def _filter_excluded(ingredients: list[dict[str, Any]], constraints: dict[str, Any]) -> list[dict[str, Any]]:
    exclude = {
        str(name).strip().lower()
        for name in constraints.get("exclude_ingredients", [])
        if str(name).strip()
    }
    if not exclude:
        return ingredients
    return [ingredient for ingredient in ingredients if ingredient["name"].lower() not in exclude]


def _filter_available(ingredients: list[dict[str, Any]], constraints: dict[str, Any]) -> list[dict[str, Any]]:
    available = {
        str(name).strip().lower()
        for name in constraints.get("available_ingredients", [])
        if str(name).strip()
    }
    if not available:
        return ingredients
    filtered: list[dict[str, Any]] = []
    for ingredient in ingredients:
        name = ingredient["name"].lower()
        if name in available or any(name in alias for alias in available):
            filtered.append(ingredient)
    return filtered or ingredients


def build_recipe(template: str, constraints: dict[str, Any]) -> dict[str, Any]:
    template = (template or "sour").lower()
    base_spirit = _pick_base_spirit(template, constraints)
    sweet_scale, acid_scale = _sweet_acid_adjustments(constraints)
    abv_target = _to_float(constraints.get("abv_target"), 0.0)
    bitter_target = _clamp(_to_float(constraints.get("bitterness_target"), 4.0), 0.0, 10.0)
    tags = [str(tag).strip().lower() for tag in constraints.get("tags", []) if str(tag).strip()]

    if template == "sour":
        spirit_qty = 2.0 if abv_target <= 0 else _clamp(1.2 + (abv_target / 30.0), 1.0, 2.25)
        ingredients = [
            {"name": base_spirit, "quantity": round(spirit_qty, 2), "unit": "oz"},
            {"name": "lemon juice", "quantity": round(0.75 * acid_scale, 2), "unit": "oz"},
            {"name": "simple syrup", "quantity": round(0.75 * sweet_scale, 2), "unit": "oz"},
        ]
        if "herbal" in tags:
            ingredients.append({"name": "green chartreuse", "quantity": 0.25, "unit": "oz"})
        instructions = ["Shake with ice for 10-12s", "Double strain into chilled coupe"]
        glassware = "coupe"
        ice_style = "none"
    elif template == "old fashioned":
        spirit_qty = 2.0 if abv_target <= 0 else _clamp(1.5 + (abv_target / 35.0), 1.4, 2.4)
        bitters_qty = round(_clamp(1 + (bitter_target / 3.5), 1.0, 4.0), 1)
        ingredients = [
            {"name": base_spirit if base_spirit != "gin" else "whiskey", "quantity": round(spirit_qty, 2), "unit": "oz"},
            {"name": "simple syrup", "quantity": round(0.25 * sweet_scale, 2), "unit": "oz"},
            {"name": "bitters", "quantity": bitters_qty, "unit": "dashes"},
        ]
        instructions = ["Stir with ice for 25-30s", "Strain over a large cube", "Express orange peel over drink"]
        glassware = "rocks"
        ice_style = "large cube"
    elif template == "negroni":
        equal_part = 1.0
        if abv_target and abv_target < 24:
            equal_part = 0.85
        ingredients = [
            {"name": base_spirit, "quantity": round(equal_part, 2), "unit": "oz"},
            {"name": "sweet vermouth", "quantity": round(equal_part * sweet_scale, 2), "unit": "oz"},
            {"name": "campari", "quantity": round(equal_part * _clamp(bitter_target / 5.0, 0.7, 1.25), 2), "unit": "oz"},
        ]
        instructions = ["Stir with ice for 25-30s", "Strain over fresh ice in rocks glass"]
        glassware = "rocks"
        ice_style = "cubed"
    else:  # collins and fallback highball styles
        spirit_qty = 2.0 if abv_target <= 0 else _clamp(1.3 + (abv_target / 35.0), 1.0, 2.1)
        soda_qty = _clamp(1.8 + ((10 - abv_target) / 8.0) if abv_target else 2.4, 1.6, 4.0)
        ingredients = [
            {"name": base_spirit, "quantity": round(spirit_qty, 2), "unit": "oz"},
            {"name": "lemon juice", "quantity": round(0.75 * acid_scale, 2), "unit": "oz"},
            {"name": "simple syrup", "quantity": round(0.7 * sweet_scale, 2), "unit": "oz"},
            {"name": "soda water", "quantity": round(soda_qty, 2), "unit": "oz"},
        ]
        instructions = ["Shake all but soda with ice", "Strain into Collins glass over fresh ice", "Top with soda water"]
        glassware = "collins"
        ice_style = "cubed"

    ingredients = _filter_excluded(ingredients, constraints)
    ingredients = _filter_available(ingredients, constraints)
    recipe_name = constraints.get("name") or f"{template.title()} Draft"
    return {
        "name": recipe_name,
        "ingredients": ingredients,
        "instructions": instructions,
        "glassware": glassware,
        "ice_style": ice_style,
    }
