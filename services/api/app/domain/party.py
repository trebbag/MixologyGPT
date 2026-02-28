from typing import Any, Dict, List, Optional, Tuple

from app.domain.units import to_ml, from_ml


def _safe_to_ml(quantity: float, unit: str) -> Optional[float]:
    try:
        return to_ml(quantity, unit)
    except ValueError:
        return None


def aggregate_ingredients(
    recipes: List[Dict[str, Any]],
    total_servings: int,
    output_unit: str = "oz",
    servings_by_recipe: Optional[Dict[str, int]] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    totals: Dict[str, Dict[str, Any]] = {}
    non_convertible: List[Dict[str, Any]] = []

    for recipe in recipes:
        servings = total_servings
        if servings_by_recipe:
            servings = servings_by_recipe.get(str(recipe.get("id")), total_servings)
        for ing in recipe.get("ingredients", []):
            name = str(ing.get("name", ""))
            qty = float(ing.get("quantity", 0)) * servings
            unit = str(ing.get("unit", ""))
            ml = _safe_to_ml(qty, unit)
            if ml is None:
                non_convertible.append({"name": name, "quantity": qty, "unit": unit})
                continue
            bucket = totals.setdefault(name.lower(), {"name": name, "ml": 0.0})
            bucket["ml"] += ml

    aggregated = []
    for item in totals.values():
        quantity = from_ml(item["ml"], output_unit)
        aggregated.append({"name": item["name"], "quantity": round(quantity, 2), "unit": output_unit})

    return aggregated, non_convertible


def build_batch_plan(
    recipes: List[Dict[str, Any]],
    total_servings: int,
    dilution: float,
    servings_by_recipe: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    plan: List[Dict[str, Any]] = []
    for recipe in recipes:
        servings = total_servings
        if servings_by_recipe:
            servings = servings_by_recipe.get(str(recipe.get("id")), total_servings)
        ingredients = []
        total_ml = 0.0
        for ing in recipe.get("ingredients", []):
            name = str(ing.get("name", ""))
            qty = float(ing.get("quantity", 0)) * servings
            unit = str(ing.get("unit", ""))
            ingredients.append({"name": name, "quantity": round(qty, 2), "unit": unit})
            ml = _safe_to_ml(qty, unit)
            if ml is not None:
                total_ml += ml
        dilution_ml = total_ml * dilution
        if dilution_ml > 0:
            ingredients.append({"name": "water", "quantity": round(from_ml(dilution_ml, "oz"), 2), "unit": "oz"})
        plan.append(
            {
                "recipe_id": recipe.get("id"),
                "name": recipe.get("name"),
                "servings": servings,
                "ingredients": ingredients,
                "dilution": dilution,
            }
        )
    return plan
