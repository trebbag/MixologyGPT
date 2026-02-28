"""Mixology Creator Agent API client."""

from pathlib import Path

from ..common.client import post_json
from ..common.schema_validator import validate_or_raise

SCHEMA_DIR = Path(__file__).resolve().parents[3] / "packages" / "shared_types" / "schemas"


def generate_recipe(payload: dict) -> dict:
    input_schema = SCHEMA_DIR / "studio_generation_request.json"
    output_schema = SCHEMA_DIR / "mixology_creator_output.json"
    validate_or_raise(input_schema, payload)
    response = post_json("/v1/agents/mixology-creator/generate", payload)
    validate_or_raise(output_schema, response)
    return response
