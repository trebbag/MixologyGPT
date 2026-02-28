"""Balance Engine API client."""

from pathlib import Path

from ..common.client import post_json
from ..common.schema_validator import validate_or_raise

SCHEMA_DIR = Path(__file__).resolve().parents[3] / "packages" / "shared_types" / "schemas"


def assess_and_fix(payload: dict) -> dict:
    input_schema = SCHEMA_DIR / "review.json"
    output_schema = SCHEMA_DIR / "balance_engine_output.json"
    validate_or_raise(input_schema, payload)
    response = post_json("/v1/agents/balance-engine/review", payload)
    validate_or_raise(output_schema, response)
    return response
