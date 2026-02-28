import json
from pathlib import Path
from typing import Any

from jsonschema import Draft7Validator


def validate_schema(schema_path: Path, payload: dict[str, Any]) -> None:
    schema = json.loads(schema_path.read_text())
    validator = Draft7Validator(schema)
    errors = sorted(validator.iter_errors(payload), key=lambda e: e.path)
    if errors:
        messages = "; ".join([f"{list(e.path)}: {e.message}" for e in errors])
        raise ValueError(messages)
