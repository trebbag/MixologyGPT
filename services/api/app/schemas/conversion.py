import uuid
from typing import Optional

from pydantic import BaseModel


class ConversionPlanRequest(BaseModel):
    input_ingredient_id: uuid.UUID
    input_quantity: float
    input_unit: str
    output_ingredient_id: uuid.UUID
    output_unit: str
    ratio: Optional[str] = None
    output_quantity: Optional[float] = None


class ConversionExecuteRequest(BaseModel):
    input_lot_id: uuid.UUID
    input_quantity: float
    input_unit: str
    output_inventory_item_id: uuid.UUID
    output_unit: str
    ratio: Optional[str] = None
    output_quantity: Optional[float] = None
