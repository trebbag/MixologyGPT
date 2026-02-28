"""Recipe Harvester Agent API client."""

from pathlib import Path

from ..common.client import post_json
from ..common.schema_validator import validate_or_raise

SCHEMA_DIR = Path(__file__).resolve().parents[3] / "packages" / "shared_types" / "schemas"


def process_extraction(payload: dict) -> dict:
    input_schema = SCHEMA_DIR / "recipe_extraction.json"
    output_schema = SCHEMA_DIR / "recipe_harvester_output.json"
    validate_or_raise(input_schema, payload)
    response = post_json("/v1/agents/recipe-harvester/extraction", payload)
    validate_or_raise(output_schema, response)
    return response
