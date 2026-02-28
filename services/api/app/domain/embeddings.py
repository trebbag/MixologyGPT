import hashlib
import logging
from typing import Iterable, List, Optional

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models.recipe import Recipe, RecipeEmbedding
from app.db.models.ingredient import Ingredient, IngredientEmbedding


EMBEDDING_MODEL = "hash-1536"
_async_client: Optional[AsyncOpenAI] = None
logger = logging.getLogger(__name__)


def _get_async_client() -> AsyncOpenAI:
    global _async_client
    if _async_client is None:
        _async_client = AsyncOpenAI()
    return _async_client


def _hash_embedding(text: str, dimensions: int) -> List[float]:
    """Deterministic, lightweight embedding for local/dev usage."""
    if not text:
        return [0.0] * dimensions
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    vector: List[float] = []
    while len(vector) < dimensions:
        for b in digest:
            vector.append((b / 255.0) * 2.0 - 1.0)
            if len(vector) == dimensions:
                break
        digest = hashlib.sha256(digest).digest()
    return vector


async def text_to_embedding(text: str) -> List[float]:
    provider = settings.embeddings_provider.lower()
    if provider == "openai":
        try:
            client = _get_async_client()
            params = {
                "model": settings.embeddings_model,
                "input": text or "",
            }
            if settings.embeddings_model.startswith("text-embedding-3") and settings.embeddings_dimensions:
                params["dimensions"] = settings.embeddings_dimensions
            response = await client.embeddings.create(**params)
            return response.data[0].embedding
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "OpenAI embedding request failed; falling back to deterministic hash embedding",
                extra={"model": settings.embeddings_model, "error": str(exc)[:240]},
            )
    return _hash_embedding(text, settings.embeddings_dimensions)


def recipe_to_text(recipe: Recipe) -> str:
    parts = [recipe.canonical_name or "", recipe.description or ""]
    if recipe.ingredients:
        parts.append(str(recipe.ingredients))
    if recipe.instructions:
        parts.append(" ".join(recipe.instructions))
    return "\n".join(parts)


def ingredient_to_text(ingredient: Ingredient) -> str:
    parts = [
        ingredient.canonical_name or "",
        ingredient.category or "",
        ingredient.subcategory or "",
        ingredient.description or "",
    ]
    return "\n".join([part for part in parts if part])


async def ensure_recipe_embedding(session: AsyncSession, recipe: Recipe) -> RecipeEmbedding:
    result = await session.execute(
        select(RecipeEmbedding).where(
            RecipeEmbedding.recipe_id == recipe.id,
            RecipeEmbedding.model
            == (
                settings.embeddings_model
                if settings.embeddings_provider.lower() == "openai"
                else EMBEDDING_MODEL
            ),
        )
    )
    existing = result.scalars().first()
    if existing:
        return existing
    embedding = RecipeEmbedding(
        recipe_id=recipe.id,
        model=settings.embeddings_model if settings.embeddings_provider.lower() == "openai" else EMBEDDING_MODEL,
        embedding=await text_to_embedding(recipe_to_text(recipe)),
    )
    session.add(embedding)
    await session.flush()
    return embedding


async def rebuild_recipe_embeddings(session: AsyncSession, recipes: Iterable[Recipe]) -> int:
    count = 0
    for recipe in recipes:
        await ensure_recipe_embedding(session, recipe)
        count += 1
    return count


async def ensure_ingredient_embedding(session: AsyncSession, ingredient: Ingredient) -> IngredientEmbedding:
    model_name = settings.embeddings_model if settings.embeddings_provider.lower() == "openai" else EMBEDDING_MODEL
    result = await session.execute(
        select(IngredientEmbedding).where(
            IngredientEmbedding.ingredient_id == ingredient.id,
            IngredientEmbedding.model == model_name,
        )
    )
    existing = result.scalars().first()
    if existing:
        return existing
    embedding = IngredientEmbedding(
        ingredient_id=ingredient.id,
        model=model_name,
        embedding=await text_to_embedding(ingredient_to_text(ingredient)),
    )
    session.add(embedding)
    await session.flush()
    return embedding


async def rebuild_ingredient_embeddings(session: AsyncSession, ingredients: Iterable[Ingredient]) -> int:
    count = 0
    for ingredient in ingredients:
        await ensure_ingredient_embedding(session, ingredient)
        count += 1
    return count
