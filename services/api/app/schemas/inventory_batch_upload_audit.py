import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.inventory_batch_upload import InventoryBatchUploadResolvedRow, InventoryBatchUploadSourceRef


class InventoryBatchUploadAuditRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    ingredient_id: Optional[uuid.UUID] = None
    inventory_item_id: Optional[uuid.UUID] = None
    inventory_lot_id: Optional[uuid.UUID] = None
    filename: str
    source_name: str
    canonical_name: str
    row_status: Literal["ready", "partial", "duplicate", "skipped"]
    import_action: str
    import_result: Optional[str] = None
    confidence: Optional[float] = None
    missing_fields: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    source_refs: list[InventoryBatchUploadSourceRef] = Field(default_factory=list)
    resolved: InventoryBatchUploadResolvedRow
    review_status: Literal["pending", "approved", "rejected"]
    review_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by_user_id: Optional[uuid.UUID] = None
    created_at: datetime


class InventoryBatchUploadAuditListResponse(BaseModel):
    counts: dict[str, int] = Field(default_factory=dict)
    rows: list[InventoryBatchUploadAuditRead] = Field(default_factory=list)


class InventoryBatchUploadAuditReviewRequest(BaseModel):
    review_status: Literal["pending", "approved", "rejected"]
    review_notes: Optional[str] = Field(default=None, max_length=2000)
