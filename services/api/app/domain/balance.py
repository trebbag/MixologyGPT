from typing import Any, Dict, List, Optional

from app.domain.units import to_ml


SPIRIT_ABV = {
    "gin": 40.0,
    "vodka": 40.0,
    "rum": 40.0,
    "tequila": 40.0,
    "whiskey": 40.0,
    "bourbon": 40.0,
    "rye": 40.0,
    "brandy": 40.0,
    "cognac": 40.0,
    "vermouth": 16.0,
    "campari": 24.0,
    "amaro": 24.0,
    "chartreuse": 55.0,
}

SWEET_KEYWORDS = ["syrup", "honey", "sugar", "grenadine", "liqueur", "vermouth", "simple"]
ACID_KEYWORDS = ["lemon", "lime", "grapefruit", "acid"]
BITTER_KEYWORDS = ["bitters", "campari", "amaro"]
LOW_ABV_KEYWORDS = ["vermouth", "aperitivo", "sherry", "wine", "fortified"]


def _estimate_abv_for_name(name: str) -> float:
    lower = name.lower()
    for key, abv in SPIRIT_ABV.items():
        if key in lower:
            return abv
    return 0.0


def _quantity_to_ml(quantity: float, unit: str) -> float:
    try:
        return to_ml(quantity, unit)
    except ValueError:
        return 0.0


def compute_metrics(ingredients: List[Dict[str, Any]], method: Optional[str] = None) -> Dict[str, float]:
    total_ml = 0.0
    ethanol_ml = 0.0
    sweetness = 0.0
    acidity = 0.0
    bitterness = 0.0

    spirit_ml = 0.0
    for ing in ingredients:
        name = str(ing.get("name", ""))
        qty = float(ing.get("quantity", 0))
        unit = str(ing.get("unit", "ml"))
        ml = _quantity_to_ml(qty, unit)
        total_ml += ml

        abv = float(ing.get("abv", 0.0)) or _estimate_abv_for_name(name)
        ethanol_ml += ml * (abv / 100.0)
        if abv >= 20:
            spirit_ml += ml

        lower = name.lower()
        if any(key in lower for key in SWEET_KEYWORDS):
            sweetness += ml / 24.0
        if any(key in lower for key in ACID_KEYWORDS):
            acidity += ml / 24.0
        if any(key in lower for key in BITTER_KEYWORDS):
            bitterness += ml / 20.0
        if any(key in lower for key in LOW_ABV_KEYWORDS):
            ethanol_ml -= min(ml * 0.03, ethanol_ml)

    dilution = 0.0
    if method == "stir":
        dilution = 0.25
    elif method == "shake":
        dilution = 0.3
    elif method == "build":
        dilution = 0.15

    total_ml_with_dilution = total_ml * (1 + dilution) if total_ml else 1.0
    abv_estimate = (ethanol_ml / total_ml_with_dilution) * 100.0
    spirit_ratio = (spirit_ml / total_ml_with_dilution) if total_ml_with_dilution else 0.0

    return {
        "abv_estimate": round(abv_estimate, 2),
        "sweetness_index": round(sweetness, 2),
        "acidity_index": round(acidity, 2),
        "bitterness_index": round(bitterness, 2),
        "spirit_ratio": round(spirit_ratio, 3),
    }


def suggest_fixes(metrics: Dict[str, float], feedback: str) -> List[Dict[str, str]]:
    suggestions: List[Dict[str, str]] = []
    if feedback == "too_sweet":
        suggestions.append({"action": "reduce_sweetener", "effect": "Less sweetness, more balance"})
        suggestions.append({"action": "increase_acid", "effect": "Brighter finish"})
    elif feedback == "too_sour":
        suggestions.append({"action": "reduce_acid", "effect": "Smoother, less sharp"})
        suggestions.append({"action": "increase_sweetener", "effect": "Rounder profile"})
    elif feedback == "too_bitter":
        suggestions.append({"action": "reduce_bitters", "effect": "Less bitterness"})
        suggestions.append({"action": "add_sweetener", "effect": "Balances bitterness"})
    elif feedback == "too_strong":
        suggestions.append({"action": "lengthen", "effect": "Lower ABV"})
    elif feedback == "too_weak":
        suggestions.append({"action": "increase_spirit", "effect": "Higher ABV"})
    if metrics.get("acidity_index", 0) < 0.5 and metrics.get("sweetness_index", 0) > 1.0:
        suggestions.append({"action": "add_citrus", "effect": "Improves contrast and lift"})
    if metrics.get("spirit_ratio", 0) > 0.65 and feedback != "too_strong":
        suggestions.append({"action": "increase_dilution", "effect": "Softens heat and improves integration"})
    return suggestions


def apply_fix(ingredients: List[Dict[str, Any]], feedback: str) -> List[Dict[str, Any]]:
    adjusted = []
    for ing in ingredients:
        name = str(ing.get("name", ""))
        qty = float(ing.get("quantity", 0))
        unit = str(ing.get("unit", "ml"))
        lower = name.lower()
        if feedback == "too_sweet" and any(key in lower for key in SWEET_KEYWORDS):
            qty *= 0.8
        elif feedback == "too_sour" and any(key in lower for key in ACID_KEYWORDS):
            qty *= 0.8
        elif feedback == "too_bitter" and any(key in lower for key in BITTER_KEYWORDS):
            qty *= 0.7
        elif feedback == "too_strong" and any(key in lower for key in SPIRIT_ABV.keys()):
            qty *= 0.85
        elif feedback == "too_weak" and any(key in lower for key in SPIRIT_ABV.keys()):
            qty *= 1.15
        adjusted.append({"name": name, "quantity": round(qty, 2), "unit": unit})
    return adjusted
