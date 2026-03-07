import uuid
from typing import Literal, Optional

from pydantic import BaseModel, Field


class InventoryBatchUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=260)
    content: str = Field(min_length=1, max_length=50000)


class InventoryBatchUploadSourceRef(BaseModel):
    label: str
    url: Optional[str] = None


class InventoryBatchUploadResolvedRow(BaseModel):
    canonical_name: str
    display_name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    description: Optional[str] = None
    abv: Optional[float] = None
    is_alcoholic: bool
    is_perishable: bool
    unit: str
    preferred_unit: Optional[str] = None
    quantity: Optional[float] = None
    lot_unit: Optional[str] = None
    location: Optional[str] = None


class InventoryBatchUploadRowRead(BaseModel):
    row_number: int
    source_name: str
    status: Literal["ready", "partial", "duplicate", "skipped"]
    import_action: Literal[
        "create_ingredient_and_item",
        "reuse_ingredient_create_item",
        "reuse_item_add_lot",
        "reuse_item",
    ]
    confidence: Optional[float] = None
    notes: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    ingredient_id: Optional[uuid.UUID] = None
    inventory_item_id: Optional[uuid.UUID] = None
    inventory_lot_id: Optional[uuid.UUID] = None
    import_result: Optional[str] = None
    source_refs: list[InventoryBatchUploadSourceRef] = Field(default_factory=list)
    resolved: InventoryBatchUploadResolvedRow


class InventoryBatchUploadSummary(BaseModel):
    total_rows: int
    ready_rows: int
    partial_rows: int
    duplicate_rows: int
    importable_rows: int
    skipped_rows: int
    pending_review_rows: int = 0
    created_ingredients: int = 0
    reused_ingredients: int = 0
    created_items: int = 0
    reused_items: int = 0
    created_lots: int = 0


class InventoryBatchUploadLookupTelemetry(BaseModel):
    cache_hits: int = 0
    cache_misses: int = 0
    cocktaildb_requests: int = 0
    cocktaildb_failures: int = 0
    openai_requests: int = 0
    openai_failures: int = 0
    openai_input_tokens: int = 0
    openai_output_tokens: int = 0
    openai_total_tokens: int = 0


class InventoryBatchUploadResponse(BaseModel):
    filename: str
    applied: bool = False
    summary: InventoryBatchUploadSummary
    lookup_telemetry: InventoryBatchUploadLookupTelemetry = Field(default_factory=InventoryBatchUploadLookupTelemetry)
    rows: list[InventoryBatchUploadRowRead]
