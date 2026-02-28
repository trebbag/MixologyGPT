import json
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jsonschema import Draft7Validator
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.inventory import inventory_insights
from app.api.routes.recipes import ingest_recipe
from app.core.deps import current_active_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.models.ingredient import Ingredient
from app.db.models.recipe import Recipe, RecipeIngredient
from app.db.models.review import Review
from app.db.models.user import User
from app.db.session import get_db
from app.domain.balance import apply_fix, compute_metrics, suggest_fixes
from app.domain.embeddings import rebuild_ingredient_embeddings
from app.domain.llm import generate_json
from app.domain.studio_generator import build_recipe
from app.domain.knowledge import search_knowledge_chunks
from app.core.paths import resolve_schema_dir
from app.schemas.recipe import RecipeIngest, RecipeRead


router = APIRouter()
SCHEMA_DIR = resolve_schema_dir()

MIXOLOGY_RECIPE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["name", "ingredients", "instructions"],
    "properties": {
        "name": {"type": "string"},
        "ingredients": {"type": "array", "items": {"type": "object"}},
        "instructions": {"type": "array", "items": {"type": "string"}},
        "glassware": {"type": "string"},
        "ice_style": {"type": "string"},
    },
}

COPILOT_RECIPE_PROMPT = (
    "Create a cocktail recipe JSON object with name, ingredients (name, quantity, unit), "
    "instructions, glassware, and ice_style. Keep it concise."
)


def _validate_or_raise(schema_name: str, payload: Dict[str, Any]) -> None:
    schema_path = SCHEMA_DIR / schema_name
    if not schema_path.exists():
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Schema not found")
    schema = json.loads(schema_path.read_text())
    validator = Draft7Validator(schema)
    errors = sorted(validator.iter_errors(payload), key=lambda e: e.path)
    if errors:
        messages = "; ".join([f"{list(e.path)}: {e.message}" for e in errors])
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Schema validation failed: {messages}",
        )


@router.post("/inventory-steward/refresh-embeddings")
@limiter.limit(f"{settings.rate_limit_agent_inventory_per_minute}/minute")
async def inventory_steward_refresh(
    payload: Dict[str, Any],
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    _validate_or_raise("conversion_plan.json", payload)
    ingredients_result = await db.execute(select(Ingredient))
    ingredients = list(ingredients_result.scalars().all())
    count = await rebuild_ingredient_embeddings(db, ingredients)
    await db.commit()
    insights = await inventory_insights(db=db, user=user)
    output = {"status": "ok", "processed": True, "embedded": count, "insights": insights}
    _validate_or_raise("inventory_steward_output.json", output)
    return output


@router.post("/recipe-harvester/extraction")
@limiter.limit(f"{settings.rate_limit_agent_harvest_per_minute}/minute")
async def recipe_harvester_extract(
    payload: Dict[str, Any],
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    _validate_or_raise("recipe_extraction.json", payload)
    ingest = RecipeIngest(**payload)
    recipe = await ingest_recipe(ingest, db=db, _user=user)
    recipe.review_status = "pending"
    await db.commit()
    output = {"status": "ok", "recipe": RecipeRead.model_validate(recipe).model_dump()}
    _validate_or_raise("recipe_harvester_output.json", output)
    return output


@router.post("/mixology-creator/generate")
@limiter.limit(f"{settings.rate_limit_agent_mixology_per_minute}/minute")
async def mixology_creator_generate(
    payload: Dict[str, Any],
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    _validate_or_raise("studio_generation_request.json", payload)
    constraints = payload.get("constraints") or {}
    template = (payload.get("template") or constraints.get("style") or "sour").lower()
    knowledge_context = ""
    try:
        query = f"{template} cocktail with {constraints}"
        chunks = await search_knowledge_chunks(db, query, limit=3)
        if chunks:
            knowledge_context = "\n".join([chunk.content for chunk in chunks])
    except Exception:
        knowledge_context = ""
    top_rated = await db.execute(
        select(Review.recipe_id, func.avg(Review.rating).label("avg_rating"))
        .group_by(Review.recipe_id)
        .order_by(desc("avg_rating"))
        .limit(3)
    )
    top_recipes = []
    for recipe_id, avg_rating in top_rated.all():
        recipe = await db.get(Recipe, recipe_id)
        if recipe:
            top_recipes.append(f"{recipe.canonical_name} ({avg_rating:.2f})")
    recipe = await generate_json(
        "You are a mixologist assistant that outputs only JSON.",
        f"{COPILOT_RECIPE_PROMPT}\nTemplate: {template}\nConstraints: {constraints}\nTop rated recipes: {top_recipes}\nKnowledge:\n{knowledge_context}",
        MIXOLOGY_RECIPE_SCHEMA,
    )
    if not recipe:
        recipe = build_recipe(template, constraints)
    metrics = compute_metrics(recipe.get("ingredients", []))
    output = {"status": "ok", "generated": True, "recipe": recipe, "metrics": metrics}
    _validate_or_raise("mixology_creator_output.json", output)
    return output


@router.post("/balance-engine/review")
@limiter.limit(f"{settings.rate_limit_agent_balance_per_minute}/minute")
async def balance_engine_review(
    payload: Dict[str, Any],
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    _validate_or_raise("review.json", payload)
    recipe_id = payload.get("recipe_id")
    if not recipe_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="recipe_id required")
    result = await db.execute(
        select(Recipe)
        .where(Recipe.id == recipe_id)
    )
    recipe = result.scalars().first()
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    ingredients_result = await db.execute(
        select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id)
    )
    ingredients = [
        {"name": ing.name, "quantity": ing.quantity, "unit": ing.unit}
        for ing in ingredients_result.scalars().all()
    ]
    metrics = compute_metrics(ingredients)
    feedback = "too_sweet"
    signals = payload.get("signals") or []
    if signals:
        feedback = signals[0].get("type", feedback)
    suggestions = suggest_fixes(metrics, feedback)
    adjusted = apply_fix(ingredients, feedback)
    llm_payload = await generate_json(
        "You are a cocktail balance assistant. Return JSON only.",
        f"Metrics: {metrics}\nFeedback: {feedback}\nIngredients: {ingredients}",
        {
            "type": "object",
            "additionalProperties": False,
            "required": ["suggestions", "adjusted_ingredients"],
            "properties": {
                "suggestions": {"type": "array", "items": {"type": "object"}},
                "adjusted_ingredients": {"type": "array", "items": {"type": "object"}},
            },
        },
    )
    if llm_payload:
        suggestions = llm_payload.get("suggestions", suggestions)
        adjusted = llm_payload.get("adjusted_ingredients", adjusted)
    output = {
        "status": "ok",
        "metrics": metrics,
        "suggestions": suggestions,
        "adjusted_ingredients": adjusted,
    }
    _validate_or_raise("balance_engine_output.json", output)
    return output
