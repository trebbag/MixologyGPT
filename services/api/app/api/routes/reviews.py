from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_active_user, current_active_admin
from app.db.session import get_db
from app.db.models.review import Review, RecipeModeration, ReviewSignal
from app.schemas.review import (
    ReviewCreate,
    ReviewRead,
    RecipeModerationCreate,
    RecipeModerationRead,
    RecipeModerationUpdate,
)
from app.db.models.user import User
from app.db.models.recipe import Recipe


router = APIRouter()


@router.post("", response_model=ReviewRead)
async def create_review(
    payload: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    review = Review(user_id=user.id, **payload.model_dump())
    db.add(review)
    await db.commit()
    await db.refresh(review)
    if payload.signals:
        for signal in payload.signals:
            signal_type = signal.get("type")
            value = signal.get("value")
            if not signal_type or not value:
                continue
            db.add(ReviewSignal(review_id=review.id, signal_type=signal_type, value=value))
        await db.commit()
    return review


@router.get("", response_model=List[ReviewRead])
async def list_reviews(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(select(Review).where(Review.user_id == user.id))
    return list(result.scalars().all())


@router.post("/recipes/{recipe_id}/moderations", response_model=RecipeModerationRead)
async def create_recipe_moderation(
    recipe_id: str,
    payload: RecipeModerationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_admin),
):
    recipe = await db.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    moderation = RecipeModeration(
        recipe_id=recipe.id,
        reviewer_id=user.id,
        status=payload.status,
        quality_label=payload.quality_label,
        notes=payload.notes,
        overrides=payload.overrides,
    )
    recipe.review_status = payload.status
    if payload.quality_label is not None:
        recipe.quality_label = payload.quality_label
    db.add(moderation)
    await db.commit()
    await db.refresh(moderation)
    return moderation


@router.get("/recipes/{recipe_id}/moderations", response_model=list[RecipeModerationRead])
async def list_recipe_moderations(
    recipe_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_admin),
):
    result = await db.execute(
        select(RecipeModeration).where(RecipeModeration.recipe_id == recipe_id).order_by(RecipeModeration.created_at.desc())
    )
    return list(result.scalars().all())


@router.patch("/recipes/{recipe_id}/moderations/{moderation_id}", response_model=RecipeModerationRead)
async def update_recipe_moderation(
    recipe_id: str,
    moderation_id: str,
    payload: RecipeModerationUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_admin),
):
    moderation = await db.get(RecipeModeration, moderation_id)
    if not moderation or str(moderation.recipe_id) != recipe_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Moderation not found")
    if payload.status is not None:
        moderation.status = payload.status
    if payload.quality_label is not None:
        moderation.quality_label = payload.quality_label
    if payload.notes is not None:
        moderation.notes = payload.notes
    if payload.overrides is not None:
        moderation.overrides = payload.overrides
    recipe = await db.get(Recipe, recipe_id)
    if recipe:
        if payload.status is not None:
            recipe.review_status = payload.status
        if payload.quality_label is not None:
            recipe.quality_label = payload.quality_label
    await db.commit()
    await db.refresh(moderation)
    return moderation
