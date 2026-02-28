from typing import Dict, List, Optional, Tuple


def normalize_name(name: str) -> str:
    return name.strip().lower()


def matches_inventory(recipe_ing: str, inventory_names: List[str]) -> bool:
    recipe_lower = recipe_ing.lower()
    for inv in inventory_names:
        inv_lower = inv.lower()
        if inv_lower in recipe_lower or recipe_lower in inv_lower:
            return True
    return False


def classify_recipes(recipes: List[dict], inventory_names: List[str]) -> Tuple[List[dict], List[dict]]:
    make_now = []
    missing_one = []
    for recipe in recipes:
        ingredients = recipe.get("ingredients", [])
        missing = []
        for ing in ingredients:
            name = ing.get("name", "")
            if not matches_inventory(name, inventory_names):
                missing.append(name)
        if not missing:
            make_now.append(recipe)
        elif len(missing) == 1:
            recipe_copy = {**recipe, "missing": missing}
            missing_one.append(recipe_copy)
    return make_now, missing_one


def unlock_scores(
    recipes: List[dict],
    inventory_names: List[str],
    weights: Optional[Dict[str, float]] = None,
) -> List[dict]:
    counts: Dict[str, float] = {}
    for recipe in recipes:
        ingredients = recipe.get("ingredients", [])
        missing = []
        for ing in ingredients:
            name = ing.get("name", "")
            if not matches_inventory(name, inventory_names):
                missing.append(name)
        if len(missing) == 1:
            key = missing[0]
            weight = 1.0
            if weights:
                weight = weights.get(normalize_name(key), weight)
            counts[key] = counts.get(key, 0.0) + weight
    suggestions = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    return [{"ingredient": name, "unlock_count": round(count, 2)} for name, count in suggestions[:5]]
