from sqlalchemy import Column, DateTime, Float, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UUIDMixin


class InventoryBatchUploadAudit(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "inventory_batch_upload_audits"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    user_email = Column(String, nullable=False)
    ingredient_id = Column(UUID(as_uuid=True), ForeignKey("ingredients.id"), nullable=True, index=True)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=True, index=True)
    inventory_lot_id = Column(UUID(as_uuid=True), ForeignKey("inventory_lots.id"), nullable=True, index=True)
    reviewed_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    filename = Column(String, nullable=False)
    source_name = Column(String, nullable=False)
    canonical_name = Column(String, nullable=False)
    row_status = Column(String, nullable=False)
    import_action = Column(String, nullable=False)
    import_result = Column(String, nullable=True)
    review_status = Column(String, nullable=False, default="pending", index=True)
    review_notes = Column(Text, nullable=True)
    confidence = Column(Float, nullable=True)
    missing_fields = Column(JSON, nullable=False, default=list)
    notes = Column(JSON, nullable=False, default=list)
    source_refs = Column(JSON, nullable=False, default=list)
    resolved_payload = Column(JSON, nullable=False)
