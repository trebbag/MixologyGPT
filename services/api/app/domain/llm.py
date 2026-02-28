import json
import re
from typing import Any, Dict, Optional

from jsonschema import Draft7Validator
from openai import AsyncOpenAI

from app.core.config import settings


_async_client: Optional[AsyncOpenAI] = None


def _get_async_client() -> AsyncOpenAI:
    global _async_client
    if _async_client is None:
        _async_client = AsyncOpenAI()
    return _async_client


def _resolve_model(model: str) -> str:
    normalized = re.sub(r"\s+", "-", (model or "").strip())
    if not normalized:
        return "chatgpt-5.2-thinking"
    lower = normalized.lower()
    if "chatgpt-5.2-thinking" in lower or "gpt-5.2-thinking" in lower:
        return "chatgpt-5.2-thinking"
    return normalized


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    fenced = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _validate(schema: Dict[str, Any], payload: Dict[str, Any]) -> bool:
    validator = Draft7Validator(schema)
    return not any(validator.iter_errors(payload))


async def generate_json(system_prompt: str, user_prompt: str, schema: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if settings.llm_provider.lower() != "openai":
        return None
    client = _get_async_client()
    response = await client.chat.completions.create(
        model=_resolve_model(settings.llm_model),
        temperature=settings.llm_temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    content = response.choices[0].message.content or ""
    payload = _extract_json(content)
    if not payload:
        return None
    if not _validate(schema, payload):
        return None
    return payload
