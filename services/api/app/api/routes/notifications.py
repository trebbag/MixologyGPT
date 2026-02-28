from typing import List, Optional

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import current_active_user, optional_user
from app.db.session import get_db
from app.db.models.notification import Notification
from app.db.models.inventory import InventoryItem, InventoryLot
from app.schemas.notification import NotificationCreate, NotificationRead, NotificationUpdate
from app.db.models.user import User


router = APIRouter()


@router.post("", response_model=NotificationRead)
async def create_notification(
    payload: NotificationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    notification = Notification(user_id=user.id, **payload.model_dump(exclude_none=True))
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return notification


@router.get("", response_model=List[NotificationRead])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.deliver_at.desc())
    )
    return list(result.scalars().all())


@router.patch("/{notification_id}", response_model=NotificationRead)
async def update_notification(
    notification_id: str,
    payload: NotificationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    notification = await db.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    update_data = payload.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] not in {"pending", "read"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported status")
    for key, value in update_data.items():
        setattr(notification, key, value)
    await db.commit()
    await db.refresh(notification)
    return notification


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    notification = await db.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.status = "read"
    await db.commit()
    await db.refresh(notification)
    return notification


@router.post("/read-all")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(select(Notification).where(Notification.user_id == user.id))
    notifications = list(result.scalars().all())
    for notification in notifications:
        notification.status = "read"
    await db.commit()
    return {"status": "ok", "updated": len(notifications)}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    notification = await db.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    await db.delete(notification)
    await db.commit()
    return {"status": "ok"}


@router.post("/refresh")
async def refresh_notifications(
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(optional_user),
    internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
):
    if internal_token != settings.internal_token and (not user or user.role != "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    now = datetime.utcnow()
    expiry_cutoff = now + timedelta(days=settings.expiry_window_days)

    expiring = await db.execute(
        select(InventoryLot, InventoryItem)
        .join(InventoryItem, InventoryLot.inventory_item_id == InventoryItem.id)
        .where(InventoryLot.expiry_date != None)  # noqa: E711
        .where(InventoryLot.expiry_date <= expiry_cutoff)
    )
    expiring_rows = list(expiring.all())

    low_stock_items = []
    items = await db.execute(select(InventoryItem))
    for item in items.scalars().all():
        lots = await db.execute(select(InventoryLot).where(InventoryLot.inventory_item_id == item.id))
        total = sum(lot.quantity for lot in lots.scalars().all())
        if total <= settings.low_stock_threshold:
            low_stock_items.append(
                {"item_id": str(item.id), "total": total, "unit": item.unit, "user_id": item.user_id}
            )

    created = 0
    existing_result = await db.execute(
        select(Notification).where(Notification.status == "pending")
    )
    existing_notifications = list(existing_result.scalars().all())
    existing_keys: set[tuple[str, str, str]] = set()
    for notification in existing_notifications:
        payload_data = notification.payload or {}
        key_value = None
        if notification.type == "expiry_soon":
            key_value = str(payload_data.get("lot_id") or "")
        elif notification.type == "low_stock":
            key_value = str(payload_data.get("item_id") or "")
        if not key_value:
            continue
        existing_keys.add((str(notification.user_id), notification.type, key_value))

    for lot, item in expiring_rows:
        key = (str(item.user_id), "expiry_soon", str(lot.id))
        if key in existing_keys:
            continue
        db.add(
            Notification(
                user_id=item.user_id,
                type="expiry_soon",
                payload={"lot_id": str(lot.id), "expires_at": lot.expiry_date.isoformat()},
                status="pending",
            )
        )
        existing_keys.add(key)
        created += 1
    for item in low_stock_items:
        key = (str(item["user_id"]), "low_stock", str(item["item_id"]))
        if key in existing_keys:
            continue
        db.add(
            Notification(
                user_id=item["user_id"],
                type="low_stock",
                payload={
                    "item_id": item["item_id"],
                    "total": item["total"],
                    "unit": item["unit"],
                    "user_id": str(item["user_id"]),
                },
                status="pending",
            )
        )
        existing_keys.add(key)
        created += 1

    await db.commit()
    return {"status": "ok", "created": created}
