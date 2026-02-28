import base64
import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_active_user
from app.db.models.media import MediaAsset
from app.db.session import get_db
from app.schemas.media import MediaAssetCreate, MediaAssetRead, MediaUploadRequest
from app.db.models.user import User
from app.core.paths import resolve_media_root


router = APIRouter()
MEDIA_ROOT = resolve_media_root()
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


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


@router.post("/upload", response_model=MediaAssetRead)
async def upload_media_asset(
    payload: MediaUploadRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        decoded = base64.b64decode(payload.data_base64, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid base64 payload") from exc

    if len(decoded) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_UPLOAD_BYTES} bytes limit",
        )

    suffix = Path(payload.filename).suffix.lower()
    if not suffix:
        guessed = mimetypes.guess_extension(payload.content_type) or ".bin"
        suffix = guessed

    asset = MediaAsset(
        owner_id=user.id,
        url="",
        media_type=payload.media_type,
        metadata_json={"filename": payload.filename, "content_type": payload.content_type},
    )
    db.add(asset)
    await db.flush()

    owner_dir = MEDIA_ROOT / str(user.id)
    owner_dir.mkdir(parents=True, exist_ok=True)
    file_path = owner_dir / f"{asset.id}{suffix}"
    file_path.write_bytes(decoded)

    asset.url = f"/v1/media/files/{asset.id}"
    asset.metadata_json = {
        "filename": payload.filename,
        "content_type": payload.content_type,
        "storage_path": str(file_path.relative_to(MEDIA_ROOT)),
        "size_bytes": len(decoded),
    }
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.get("", response_model=list[MediaAssetRead])
async def list_media_assets(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(select(MediaAsset).where(MediaAsset.owner_id == user.id))
    return list(result.scalars().all())


@router.get("/files/{asset_id}")
async def get_media_file(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    asset = await db.get(MediaAsset, asset_id)
    if not asset or (asset.owner_id != user.id and user.role != "admin"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    metadata = asset.metadata_json or {}
    storage_path = metadata.get("storage_path")
    if not storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored file path missing")
    file_path = MEDIA_ROOT / storage_path
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    media_type = metadata.get("content_type") or "application/octet-stream"
    filename = metadata.get("filename") or file_path.name
    return FileResponse(path=file_path, media_type=media_type, filename=filename)
