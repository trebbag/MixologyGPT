from datetime import datetime, timedelta
from typing import List, Optional, Tuple, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_active_user
from app.db.session import get_db
from app.db.models.recommendation import Recommendation, TonightFlight, PartyMenu, BatchPlan
from app.db.models.inventory import InventoryItem, InventoryLot, InventoryEvent
from app.db.models.ingredient import Ingredient, IngredientEquivalency
from app.db.models.recipe import Recipe, RecipeIngredient
from app.db.models.review import Review, ReviewSignal, RecipeModeration
from app.domain.recommendations import classify_recipes, unlock_scores, matches_inventory, normalize_name
from app.domain.party import aggregate_ingredients, build_batch_plan
from app.domain.units import to_ml, to_ml_with_custom
from app.schemas.recommendation import (
    RecommendationCreate,
    RecommendationRead,
    TonightFlightCreate,
    TonightFlightRead,
    PartyMenuCreate,
    PartyMenuRead,
    BatchPlanCreate,
    BatchPlanRead,
    PartyMenuGenerateRequest,
    PartyMenuGenerateResponse,
    UnlockScoreResponse,
)
from app.db.models.user import User


router = APIRouter()

MAKE_NOW_CACHE_TTL_SECONDS = 30
MAKE_NOW_CACHE_MAX_RESULTS = 200
_make_now_cache: Dict[str, Tuple[datetime, List[dict]]] = {}

async def _inventory_availability(db: AsyncSession, user: User) -> tuple[list[str], dict[str, float]]:
    inv = await db.execute(
        select(InventoryItem.id, InventoryItem.unit_to_ml, Ingredient.canonical_name)
        .join(Ingredient, InventoryItem.ingredient_id == Ingredient.id)
        .where(InventoryItem.user_id == user.id)
    )
    inventory_rows = list(inv.all())
    inventory_names = [row[2] for row in inventory_rows]
    availability: dict[str, float] = {}

    if not inventory_rows:
        return inventory_names, availability

    item_to_unit_ml = {row[0]: row[1] for row in inventory_rows}
    item_to_name = {row[0]: row[2] for row in inventory_rows}
    item_ids = list(item_to_name.keys())

    lots = await db.execute(
        select(InventoryLot.inventory_item_id, InventoryLot.quantity, InventoryLot.unit)
        .where(InventoryLot.inventory_item_id.in_(item_ids))
    )
    for item_id, quantity, unit in lots.all():
        canonical_name = item_to_name.get(item_id)
        if not canonical_name:
            continue
        try:
            ml = to_ml_with_custom(quantity, unit, item_to_unit_ml.get(item_id))
        except Exception:
            continue
        availability[canonical_name.lower()] = availability.get(canonical_name.lower(), 0.0) + float(ml)

    return inventory_names, availability


def _get_cached_make_now(user_id: str) -> Optional[List[dict]]:
    cached = _make_now_cache.get(user_id)
    if not cached:
        return None
    created_at, items = cached
    if datetime.utcnow() - created_at > timedelta(seconds=MAKE_NOW_CACHE_TTL_SECONDS):
        _make_now_cache.pop(user_id, None)
        return None
    return items


def _set_cached_make_now(user_id: str, items: List[dict]) -> None:
    _make_now_cache[user_id] = (datetime.utcnow(), items)


async def _review_signal_weights(db: AsyncSession, user: User) -> dict[str, float]:
    result = await db.execute(
        select(ReviewSignal, Review.recipe_id)
        .join(Review, ReviewSignal.review_id == Review.id)
        .where(Review.user_id == user.id)
    )
    weights: dict[str, float] = {}
    for signal, _recipe_id in result.all():
        signal_type = (signal.signal_type or "").lower()
        value = (signal.value or "").lower()
        if signal_type in {"like_ingredient", "favorite_ingredient", "loved_ingredient"}:
            name = value.replace("ingredient:", "").strip()
        elif "ingredient:" in value:
            name = value.split("ingredient:", 1)[-1].strip()
        elif "->" in value:
            name = value.split("->", 1)[-1].strip()
        else:
            continue
        if not name:
            continue
        key = normalize_name(name)
        weights[key] = weights.get(key, 0.0) + 1.0
    return weights


async def _usage_weights(db: AsyncSession, user: User) -> dict[str, float]:
    result = await db.execute(
        select(InventoryEvent, InventoryItem, Ingredient)
        .join(InventoryItem, InventoryEvent.inventory_item_id == InventoryItem.id)
        .join(Ingredient, InventoryItem.ingredient_id == Ingredient.id)
        .where(InventoryItem.user_id == user.id)
    )
    weights: dict[str, float] = {}
    for event, _item, ingredient in result.all():
        if event.event_type not in {"conversion_output", "syrup_output", "syrup_input", "conversion_input"}:
            continue
        key = normalize_name(ingredient.canonical_name)
        weights[key] = weights.get(key, 0.0) + 0.2
    return weights


async def _load_recipe_overrides(db: AsyncSession, recipe_ids: list[str]) -> dict[str, dict]:
    if not recipe_ids:
        return {}
    result = await db.execute(
        select(RecipeModeration)
        .where(RecipeModeration.recipe_id.in_(recipe_ids))
        .order_by(RecipeModeration.created_at.desc())
    )
    overrides: dict[str, dict] = {}
    for moderation in result.scalars().all():
        recipe_id = str(moderation.recipe_id)
        if recipe_id in overrides:
            continue
        if moderation.status != "approved" or not moderation.overrides:
            continue
        overrides[recipe_id] = moderation.overrides
    return overrides


def _apply_override_to_ingredients(recipe: dict, override: Optional[dict]) -> dict:
    if not override:
        return recipe
    mapped = dict(override)
    if "ingredients" in mapped and "ingredient_rows" not in mapped:
        mapped["ingredient_rows"] = mapped.pop("ingredients")
    if "ingredient_rows" in mapped and mapped["ingredient_rows"] is not None:
        recipe["ingredients"] = mapped["ingredient_rows"]
    if "canonical_name" in mapped and mapped["canonical_name"]:
        recipe["name"] = mapped["canonical_name"]
    return recipe


async def _build_substitution_map(db: AsyncSession, user: User) -> dict[str, list[dict]]:
    result = await db.execute(select(IngredientEquivalency))
    equivalencies = result.scalars().all()
    substitutions_map: dict[str, list[dict]] = {}
    for eq in equivalencies:
        ing = await db.get(Ingredient, eq.ingredient_id)
        equiv = await db.get(Ingredient, eq.equivalent_ingredient_id)
        if not ing or not equiv:
            continue
        substitutions_map.setdefault(ing.canonical_name.lower(), []).append(
            {"name": equiv.canonical_name, "ratio": eq.ratio, "notes": eq.notes}
        )

    signal_result = await db.execute(
        select(ReviewSignal, Review)
        .join(Review, ReviewSignal.review_id == Review.id)
        .where(Review.user_id == user.id)
    )
    for signal, _review in signal_result.all():
        if signal.signal_type not in {"substitute", "swap"}:
            continue
        raw = signal.value or ""
        if "->" not in raw:
            continue
        left, right = [part.strip() for part in raw.split("->", 1)]
        if not left or not right:
            continue
        substitutions_map.setdefault(left.lower(), []).append(
            {"name": right, "ratio": 1.0, "notes": "From review signal"}
        )
    return substitutions_map


@router.post("", response_model=RecommendationRead)
async def create_recommendation(
    payload: RecommendationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    rec = Recommendation(user_id=user.id, **payload.model_dump())
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return rec


@router.get("", response_model=List[RecommendationRead])
async def list_recommendations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(select(Recommendation).where(Recommendation.user_id == user.id))
    return list(result.scalars().all())


@router.get("/make-now")
async def make_now(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
    limit: int = 50,
    offset: int = 0,
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    cached = _get_cached_make_now(str(user.id))
    if cached is not None:
        return cached[offset : offset + limit]

    inventory_names, availability = await _inventory_availability(db, user)
    recipes_result = await db.execute(select(Recipe.id, Recipe.canonical_name).order_by(Recipe.canonical_name))
    recipe_rows = list(recipes_result.all())
    recipe_ids = [row[0] for row in recipe_rows]
    overrides = await _load_recipe_overrides(db, [str(recipe_id) for recipe_id in recipe_ids])

    ingredients_by_recipe: dict[str, list[dict]] = {}
    if recipe_ids:
        ing_result = await db.execute(
            select(
                RecipeIngredient.recipe_id,
                RecipeIngredient.name,
                RecipeIngredient.quantity,
                RecipeIngredient.unit,
            ).where(RecipeIngredient.recipe_id.in_(recipe_ids))
        )
        for recipe_id, name, quantity, unit in ing_result.all():
            key = str(recipe_id)
            ingredients_by_recipe.setdefault(key, []).append(
                {"name": name, "quantity": quantity, "unit": unit}
            )

    make_now_items: list[dict] = []
    # Scan recipes in a deterministic order and stop once we have enough results for typical UI usage.
    for recipe_id, canonical_name in recipe_rows:
        item = {
            "id": str(recipe_id),
            "name": canonical_name,
            "ingredients": ingredients_by_recipe.get(str(recipe_id), []),
        }
        recipe = _apply_override_to_ingredients(item, overrides.get(str(recipe_id)))
        missing = []
        for ing in recipe.get("ingredients", []):
            name = ing.get("name", "")
            matched = next(
                (inv_name for inv_name in inventory_names if matches_inventory(name, [inv_name])),
                None,
            )
            if not matched:
                missing.append(name)
                continue
            try:
                required_ml = to_ml(ing.get("quantity", 0.0), ing.get("unit", "oz"))
            except Exception:
                missing.append(name)
                continue
            available_ml = availability.get(matched.lower(), 0.0)
            if required_ml > available_ml:
                missing.append(name)
        if not missing:
            make_now_items.append(recipe)
            if len(make_now_items) >= MAKE_NOW_CACHE_MAX_RESULTS:
                break

    _set_cached_make_now(str(user.id), make_now_items)
    return make_now_items[offset : offset + limit]


@router.get("/missing-one")
async def missing_one(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    inventory_names, availability = await _inventory_availability(db, user)
    substitution_map = await _build_substitution_map(db, user)
    recipes_result = await db.execute(select(Recipe))
    recipe_rows = list(recipes_result.scalars().all())
    overrides = await _load_recipe_overrides(db, [str(recipe.id) for recipe in recipe_rows])
    recipes = []
    for recipe in recipe_rows:
        ing_result = await db.execute(
            select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id)
        )
        ingredients = [
            {"name": ing.name, "quantity": ing.quantity, "unit": ing.unit}
            for ing in ing_result.scalars().all()
        ]
        item = {"id": str(recipe.id), "name": recipe.canonical_name, "ingredients": ingredients}
        recipes.append(_apply_override_to_ingredients(item, overrides.get(str(recipe.id))))
    missing_one_list = []
    for recipe in recipes:
        missing = []
        for ing in recipe.get("ingredients", []):
            name = ing.get("name", "")
            matched = next(
                (inv_name for inv_name in inventory_names if matches_inventory(name, [inv_name])),
                None,
            )
            if not matched:
                missing.append({"name": name, "quantity": ing.get("quantity"), "unit": ing.get("unit")})
                continue
            try:
                required_ml = to_ml(ing.get("quantity", 0.0), ing.get("unit", "oz"))
            except Exception:
                missing.append({"name": name, "quantity": ing.get("quantity"), "unit": ing.get("unit")})
                continue
            available_ml = availability.get(matched.lower(), 0.0)
            if required_ml > available_ml:
                missing.append({"name": name, "quantity": ing.get("quantity"), "unit": ing.get("unit")})
        if len(missing) == 1:
            missing_item = missing[0]
            missing_name = missing_item.get("name", "")
            missing_item["substitutions"] = substitution_map.get(missing_name.lower(), [])
            recipe_copy = {**recipe, "missing": missing}
            missing_one_list.append(recipe_copy)
    return missing_one_list


@router.get("/unlock-score", response_model=UnlockScoreResponse)
async def unlock_score(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    inventory_names, _availability = await _inventory_availability(db, user)
    weights = await _review_signal_weights(db, user)
    usage_weights = await _usage_weights(db, user)
    for key, value in usage_weights.items():
        weights[key] = weights.get(key, 0.0) + value
    recipes_result = await db.execute(select(Recipe))
    recipe_rows = list(recipes_result.scalars().all())
    overrides = await _load_recipe_overrides(db, [str(recipe.id) for recipe in recipe_rows])
    recipes = []
    for recipe in recipe_rows:
        ing_result = await db.execute(
            select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id)
        )
        ingredients = [
            {"name": ing.name, "quantity": ing.quantity, "unit": ing.unit}
            for ing in ing_result.scalars().all()
        ]
        item = {"id": str(recipe.id), "name": recipe.canonical_name, "ingredients": ingredients}
        recipes.append(_apply_override_to_ingredients(item, overrides.get(str(recipe.id))))
    make_now_list, missing_one_list = classify_recipes(recipes, inventory_names)
    total = len(recipes)
    unlock_value = 0.0
    if total > 0:
        unlock_value = (len(make_now_list) + len(missing_one_list)) / float(total)
    suggestions = unlock_scores(recipes, inventory_names, weights)
    return UnlockScoreResponse(
        unlock_score=unlock_value,
        make_now_count=len(make_now_list),
        missing_one_count=len(missing_one_list),
        total_recipes=total,
        suggestions=suggestions,
    )


@router.get("/tonight-flight")
async def tonight_flight(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    inventory_names, _availability = await _inventory_availability(db, user)
    recipes_result = await db.execute(select(Recipe))
    recipe_rows = list(recipes_result.scalars().all())
    overrides = await _load_recipe_overrides(db, [str(recipe.id) for recipe in recipe_rows])
    recipes = []
    for recipe in recipe_rows:
        ing_result = await db.execute(
            select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id)
        )
        ingredients = [
            {"name": ing.name, "quantity": ing.quantity, "unit": ing.unit}
            for ing in ing_result.scalars().all()
        ]
        item = {"id": str(recipe.id), "name": recipe.canonical_name, "ingredients": ingredients}
        recipes.append(_apply_override_to_ingredients(item, overrides.get(str(recipe.id))))
    make_now_list, _ = classify_recipes(recipes, inventory_names)
    return make_now_list[:3]


@router.get("/substitutions")
async def substitutions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    return await _build_substitution_map(db, user)


@router.post("/party-menus/generate", response_model=PartyMenuGenerateResponse)
async def generate_party_menu(
    payload: PartyMenuGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    recipes_result = await db.execute(select(Recipe).where(Recipe.id.in_(payload.recipe_ids)))
    recipes = []
    overrides = await _load_recipe_overrides(db, [str(rid) for rid in payload.recipe_ids])
    for recipe in recipes_result.scalars().all():
        ing_result = await db.execute(
            select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id)
        )
        ingredients = [
            {"name": ing.name, "quantity": ing.quantity, "unit": ing.unit}
            for ing in ing_result.scalars().all()
        ]
        item = {"id": str(recipe.id), "name": recipe.canonical_name, "ingredients": ingredients}
        recipes.append(_apply_override_to_ingredients(item, overrides.get(str(recipe.id))))

    total_servings = payload.guest_count * payload.servings_per_guest
    servings_by_recipe = None
    if payload.servings_by_recipe:
        servings_by_recipe = {str(k): v for k, v in payload.servings_by_recipe.items()}
    shopping_list, non_convertible = aggregate_ingredients(
        recipes,
        total_servings,
        servings_by_recipe=servings_by_recipe,
    )
    batch_plan = build_batch_plan(
        recipes,
        total_servings,
        payload.dilution,
        servings_by_recipe=servings_by_recipe,
    )

    inv = await db.execute(
        select(InventoryItem, Ingredient.canonical_name)
        .join(Ingredient, InventoryItem.ingredient_id == Ingredient.id)
        .where(InventoryItem.user_id == user.id)
    )
    inventory_rows = inv.all()
    inventory_names = [row[1] for row in inventory_rows]

    availability = {}
    for item_row, canonical_name in inventory_rows:
        lots = await db.execute(
            select(InventoryLot).where(InventoryLot.inventory_item_id == item_row.id)
        )
        total = 0.0
        for lot in lots.scalars().all():
            try:
                total += to_ml(lot.quantity, lot.unit)
            except Exception:
                continue
        availability[canonical_name.lower()] = availability.get(canonical_name.lower(), 0.0) + total

    missing = []
    for item in shopping_list:
        name = item["name"]
        if not any(name.lower() in inv_name.lower() or inv_name.lower() in name.lower() for inv_name in inventory_names):
            missing.append(item)
            continue
        try:
            required_ml = to_ml(item["quantity"], item["unit"])
        except Exception:
            continue
        matched = next(
            (inv_name for inv_name in inventory_names if name.lower() in inv_name.lower() or inv_name.lower() in name.lower()),
            None,
        )
        if matched:
            available_ml = availability.get(matched.lower(), 0.0)
            reserve_ml = to_ml(payload.reserve_oz, "oz")
            if required_ml > max(available_ml - reserve_ml, 0.0):
                missing.append(item)

    return PartyMenuGenerateResponse(
        shopping_list=shopping_list + non_convertible,
        missing=missing,
        batch_plan=batch_plan,
    )


@router.get("/party-menus/draft-picks")
async def party_draft_picks(
    limit: int = 5,
    inventory_only: bool = True,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(select(Recipe))
    recipes = list(result.scalars().all())
    rating_map: dict[str, float] = {}
    review_result = await db.execute(select(Review))
    for review in review_result.scalars().all():
        rating_map.setdefault(str(review.recipe_id), []).append(review.rating)
    avg_ratings = {}
    for recipe_id, ratings in rating_map.items():
        avg_ratings[recipe_id] = sum(ratings) / len(ratings)

    inventory_names, _availability = await _inventory_availability(db, user)
    candidates = []
    for recipe in recipes:
        ing_result = await db.execute(
            select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id)
        )
        ingredients = [
            {"name": ing.name, "quantity": ing.quantity, "unit": ing.unit}
            for ing in ing_result.scalars().all()
        ]
        if inventory_only:
            if any(not matches_inventory(ing["name"], inventory_names) for ing in ingredients):
                continue
        candidates.append(
            {
                "id": str(recipe.id),
                "name": recipe.canonical_name,
                "ingredients": ingredients,
                "avg_rating": avg_ratings.get(str(recipe.id), 0.0),
            }
        )

    candidates.sort(key=lambda item: item["avg_rating"], reverse=True)
    return candidates[:limit]


@router.post("/tonight-flights", response_model=TonightFlightRead)
async def create_tonight_flight(
    payload: TonightFlightCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    flight = TonightFlight(user_id=user.id, **payload.model_dump())
    db.add(flight)
    await db.commit()
    await db.refresh(flight)
    return flight


@router.get("/tonight-flights", response_model=List[TonightFlightRead])
async def list_tonight_flights(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(select(TonightFlight).where(TonightFlight.user_id == user.id))
    return list(result.scalars().all())


@router.post("/party-menus", response_model=PartyMenuRead)
async def create_party_menu(
    payload: PartyMenuCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    menu = PartyMenu(user_id=user.id, **payload.model_dump())
    db.add(menu)
    await db.commit()
    await db.refresh(menu)
    return menu


@router.get("/party-menus", response_model=List[PartyMenuRead])
async def list_party_menus(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(select(PartyMenu).where(PartyMenu.user_id == user.id))
    return list(result.scalars().all())


@router.post("/batch-plans", response_model=BatchPlanRead)
async def create_batch_plan(
    payload: BatchPlanCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    menu = await db.get(PartyMenu, payload.party_menu_id)
    if not menu or menu.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Party menu not found")
    plan = BatchPlan(**payload.model_dump())
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.get("/batch-plans", response_model=List[BatchPlanRead])
async def list_batch_plans(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(select(BatchPlan).join(PartyMenu, BatchPlan.party_menu_id == PartyMenu.id).where(PartyMenu.user_id == user.id))
    return list(result.scalars().all())
