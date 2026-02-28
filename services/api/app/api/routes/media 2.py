from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_active_user
from app.db.session import get_db
from app.db.models.media import MediaAsset
from app.schemas.media import MediaAssetCreate, MediaAssetRead
from app.db.models.user import User


router = APIRouter()


@router.post("", response_model=MediaAssetRead)
async def create_media_asset(
    payload: MediaAssetCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    data = payload.model_dump()
    asset = MediaAsset(
        owner_id=user.id,
        url=data["url"],
        media_type=data["media_type"],
        metadata_json=data.get("metadata"),
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.get("", response_model=List[MediaAssetRead])
async def list_media_assets(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(select(MediaAsset).where(MediaAsset.owner_id == user.id))
    return list(result.scalars().all())
