"""Inventory Steward Agent API client."""

from pathlib import Path

from ..common.client import post_json
from ..common.schema_validator import validate_or_raise

SCHEMA_DIR = Path(__file__).resolve().parents[3] / "packages" / "shared_types" / "schemas"


def refresh_embeddings(payload: dict) -> dict:
    """Validate payload, call API orchestration, and validate output schema."""
    input_schema = SCHEMA_DIR / "conversion_plan.json"
    output_schema = SCHEMA_DIR / "inventory_steward_output.json"
    validate_or_raise(input_schema, payload)
    response = post_json("/v1/agents/inventory-steward/refresh-embeddings", payload)
    validate_or_raise(output_schema, response)
    return response
