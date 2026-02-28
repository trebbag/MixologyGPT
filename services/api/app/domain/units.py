from typing import Dict, Optional


UNIT_TO_ML: Dict[str, float] = {
    "ml": 1.0,
    "l": 1000.0,
    "oz": 29.5735,
    "tsp": 4.92892,
    "tbsp": 14.7868,
    "cup": 236.588,
    "dash": 0.9,
    "dashes": 0.9,
}


def to_ml(value: float, unit: str) -> float:
    key = unit.lower()
    if key not in UNIT_TO_ML:
        raise ValueError(f"Unsupported unit: {unit}")
    return value * UNIT_TO_ML[key]


def to_ml_with_custom(value: float, unit: str, unit_to_ml: Optional[float]) -> float:
    key = unit.lower()
    if key in UNIT_TO_ML:
        return value * UNIT_TO_ML[key]
    if unit_to_ml is not None:
        return value * unit_to_ml
    raise ValueError(f"Unsupported unit: {unit}")


def from_ml(value_ml: float, unit: str) -> float:
    key = unit.lower()
    if key not in UNIT_TO_ML:
        raise ValueError(f"Unsupported unit: {unit}")
    return value_ml / UNIT_TO_ML[key]


def from_ml_with_custom(value_ml: float, unit: str, unit_to_ml: Optional[float]) -> float:
    key = unit.lower()
    if key in UNIT_TO_ML:
        return value_ml / UNIT_TO_ML[key]
    if unit_to_ml is not None:
        return value_ml / unit_to_ml
    raise ValueError(f"Unsupported unit: {unit}")
