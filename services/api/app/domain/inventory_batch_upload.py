from __future__ import annotations

import asyncio
import copy
import csv
import hashlib
import io
import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import httpx
from jsonschema import Draft7Validator
from openai import AsyncOpenAI
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.metrics import (
    record_inventory_batch_lookup,
    record_inventory_batch_openai_tokens,
    record_inventory_batch_upload_request,
    record_inventory_batch_upload_row_statuses,
)
from app.db.models.ingredient import Ingredient, IngredientAlias
from app.db.models.inventory import InventoryItem, InventoryLot
from app.db.models.inventory_batch_upload_audit import InventoryBatchUploadAudit
from app.db.models.syrup import ExpiryRule
from app.db.models.user import User
from app.domain.llm import _extract_json, _resolve_model

logger = logging.getLogger(__name__)

MAX_UPLOAD_ROWS = 25
MAX_UPLOAD_CHARS = 50_000
USER_AGENT = "BartenderAIInventoryBatch/1.0"
LOOKUP_CONCURRENCY = 3
ENRICHMENT_CACHE_TTL_SECONDS = 15 * 60
MAX_ENRICHMENT_CACHE_SIZE = 256
LOCAL_ALCOHOL_CATEGORIES = {"spirit", "modifier", "liqueur", "fortified wine", "wine", "beer", "bitters", "alcohol"}
COUNT_HINTS = (
    "egg",
    "eggs",
    "lemon",
    "lime",
    "orange",
    "grapefruit",
    "pineapple",
    "cucumber",
    "mint",
    "basil",
    "thyme",
    "rosemary",
    "strawberry",
    "berry",
    "berries",
    "jalapeno",
    "pepper",
)
WEIGHT_HINTS = ("sugar", "salt", "powder", "spice", "seasoning", "tea", "coffee", "cocoa")
PERISHABLE_HINTS = (
    "juice",
    "lime",
    "lemon",
    "orange",
    "grapefruit",
    "pineapple",
    "egg",
    "cream",
    "milk",
    "yogurt",
    "butter",
    "mint",
    "basil",
    "thyme",
    "rosemary",
    "cucumber",
    "berry",
    "berries",
    "fruit",
    "coconut cream",
    "watermelon",
    "banana",
)
ALCOHOL_HINTS = (
    "gin",
    "vodka",
    "rum",
    "whiskey",
    "whisky",
    "bourbon",
    "rye",
    "scotch",
    "tequila",
    "mezcal",
    "brandy",
    "cognac",
    "armagnac",
    "pisco",
    "grappa",
    "liqueur",
    "vermouth",
    "amaro",
    "aperol",
    "campari",
    "chartreuse",
    "schnapps",
    "bitters",
    "beer",
    "cider",
    "wine",
    "sherry",
    "port",
    "madeira",
)
HEADER_ALIASES = {
    "name": "source_name",
    "ingredient": "source_name",
    "ingredient_name": "source_name",
    "item": "source_name",
    "product": "source_name",
    "display_name": "display_name",
    "label": "display_name",
    "canonical_name": "canonical_name",
    "category": "category",
    "subcategory": "subcategory",
    "type": "subcategory",
    "description": "description",
    "notes": "description",
    "abv": "abv",
    "is_alcoholic": "is_alcoholic",
    "alcoholic": "is_alcoholic",
    "is_perishable": "is_perishable",
    "perishable": "is_perishable",
    "unit": "unit",
    "preferred_unit": "preferred_unit",
    "quantity": "quantity",
    "qty": "quantity",
    "lot_unit": "lot_unit",
    "location": "location",
}
WEB_LOOKUP_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "category",
        "subcategory",
        "description",
        "abv",
        "is_alcoholic",
        "is_perishable",
        "unit",
        "preferred_unit",
        "confidence",
        "notes",
    ],
    "properties": {
        "category": {"type": ["string", "null"]},
        "subcategory": {"type": ["string", "null"]},
        "description": {"type": ["string", "null"]},
        "abv": {"type": ["number", "null"]},
        "is_alcoholic": {"type": ["boolean", "null"]},
        "is_perishable": {"type": ["boolean", "null"]},
        "unit": {"type": ["string", "null"]},
        "preferred_unit": {"type": ["string", "null"]},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
        "notes": {"type": ["string", "null"]},
    },
}


@dataclass
class BatchUploadRow:
    row_number: int
    source_name: str
    canonical_name: Optional[str] = None
    display_name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    description: Optional[str] = None
    abv: Optional[float] = None
    is_alcoholic: Optional[bool] = None
    is_perishable: Optional[bool] = None
    unit: Optional[str] = None
    preferred_unit: Optional[str] = None
    quantity: Optional[float] = None
    lot_unit: Optional[str] = None
    location: Optional[str] = None


@dataclass
class SourceReference:
    label: str
    url: Optional[str] = None


@dataclass
class BatchUploadRowResult:
    row_number: int
    source_name: str
    canonical_name: str
    display_name: Optional[str]
    category: Optional[str]
    subcategory: Optional[str]
    description: Optional[str]
    abv: Optional[float]
    is_alcoholic: bool
    is_perishable: bool
    unit: str
    preferred_unit: Optional[str]
    quantity: Optional[float]
    lot_unit: Optional[str]
    location: Optional[str]
    confidence: Optional[float]
    status: str
    import_action: str
    notes: list[str] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)
    source_refs: list[SourceReference] = field(default_factory=list)
    ingredient_id: Optional[uuid.UUID] = None
    inventory_item_id: Optional[uuid.UUID] = None
    inventory_lot_id: Optional[uuid.UUID] = None
    import_result: Optional[str] = None


@dataclass
class BatchUploadLookupTelemetry:
    cache_hits: int = 0
    cache_misses: int = 0
    cocktaildb_requests: int = 0
    cocktaildb_failures: int = 0
    openai_requests: int = 0
    openai_failures: int = 0
    openai_input_tokens: int = 0
    openai_output_tokens: int = 0
    openai_total_tokens: int = 0


@dataclass
class EnrichmentCacheEntry:
    expires_at: datetime
    cocktaildb_values: dict[str, Any] = field(default_factory=dict)
    cocktaildb_refs: list[SourceReference] = field(default_factory=list)
    cocktaildb_notes: list[str] = field(default_factory=list)
    web_values: dict[str, Any] = field(default_factory=dict)
    web_refs: list[SourceReference] = field(default_factory=list)
    web_notes: list[str] = field(default_factory=list)


_openai_client: Optional[AsyncOpenAI] = None
_enrichment_cache: dict[str, EnrichmentCacheEntry] = {}


def _get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI()
    return _openai_client


def _enrichment_cache_key(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower())


def _get_cached_enrichment(name: str) -> Optional[EnrichmentCacheEntry]:
    cache_key = _enrichment_cache_key(name)
    if not cache_key:
        return None
    entry = _enrichment_cache.get(cache_key)
    if not entry:
        return None
    if entry.expires_at <= datetime.utcnow():
        _enrichment_cache.pop(cache_key, None)
        return None
    return copy.deepcopy(entry)


def _set_cached_enrichment(
    name: str,
    *,
    cocktaildb_values: dict[str, Any],
    cocktaildb_refs: list[SourceReference],
    cocktaildb_notes: list[str],
    web_values: dict[str, Any],
    web_refs: list[SourceReference],
    web_notes: list[str],
) -> None:
    cache_key = _enrichment_cache_key(name)
    if not cache_key:
        return
    if len(_enrichment_cache) >= MAX_ENRICHMENT_CACHE_SIZE:
        oldest_key = min(_enrichment_cache.items(), key=lambda item: item[1].expires_at)[0]
        _enrichment_cache.pop(oldest_key, None)
    _enrichment_cache[cache_key] = EnrichmentCacheEntry(
        expires_at=datetime.utcnow() + timedelta(seconds=ENRICHMENT_CACHE_TTL_SECONDS),
        cocktaildb_values=copy.deepcopy(cocktaildb_values),
        cocktaildb_refs=copy.deepcopy(cocktaildb_refs),
        cocktaildb_notes=list(cocktaildb_notes),
        web_values=copy.deepcopy(web_values),
        web_refs=copy.deepcopy(web_refs),
        web_notes=list(web_notes),
    )


def _normalize_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return re.sub(r"\s+", " ", text)


def _normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower()).strip("_")


def _normalize_unit(value: Any) -> Optional[str]:
    text = _normalize_text(value)
    if not text:
        return None
    return text.lower().replace(" ", "")


def _parse_bool(value: Any) -> Optional[bool]:
    text = _normalize_text(value)
    if text is None:
        return None
    lowered = text.lower()
    if lowered in {"1", "true", "yes", "y", "alcoholic", "perishable"}:
        return True
    if lowered in {"0", "false", "no", "n", "non-alcoholic", "non alcoholic", "shelf stable"}:
        return False
    return None


def _parse_float(value: Any) -> Optional[float]:
    text = _normalize_text(value)
    if text is None:
        return None
    normalized = text.replace("%", "").replace(",", "")
    try:
        return float(normalized)
    except ValueError:
        return None


def _normalize_name(value: str) -> str:
    normalized = re.sub(r"\s+", " ", (value or "").strip())
    if not normalized:
        return normalized
    if normalized == normalized.lower():
        return " ".join(part.capitalize() if part.lower() not in {"and", "or", "of", "the"} else part for part in normalized.split())
    return normalized


def _compact_description(value: Optional[str]) -> Optional[str]:
    text = _normalize_text(value)
    if not text:
        return None
    text = text.replace("\r", " ").replace("\n", " ")
    sentences = re.split(r"(?<=[.!?])\s+", text)
    compact = sentences[0].strip() if sentences else text
    if len(compact) > 220:
        compact = compact[:217].rstrip() + "..."
    return compact


def _matches_hint(name: str, hints: tuple[str, ...]) -> bool:
    lowered = name.lower()
    return any(hint in lowered for hint in hints)


def _infer_is_alcoholic(name: str, category: Optional[str], subcategory: Optional[str], abv: Optional[float]) -> bool:
    if abv is not None and abv > 0:
        return True
    category_tokens = " ".join(filter(None, [category, subcategory])).lower()
    if any(token in category_tokens for token in LOCAL_ALCOHOL_CATEGORIES):
        return True
    return _matches_hint(name, ALCOHOL_HINTS)


def _infer_is_perishable(name: str, category: Optional[str], subcategory: Optional[str], description: Optional[str]) -> bool:
    haystack = " ".join(filter(None, [name, category, subcategory, description])).lower()
    return any(token in haystack for token in PERISHABLE_HINTS)


def _derive_category(name: str, subcategory: Optional[str], is_alcoholic: bool) -> Optional[str]:
    lowered = name.lower()
    sub = (subcategory or "").lower()
    if "bitters" in lowered or "bitters" in sub:
        return "Bitters"
    if "syrup" in lowered or any(token in lowered for token in ("grenadine", "orgeat", "falernum", "oleo")):
        return "Syrup"
    if "juice" in lowered:
        return "Juice"
    if any(token in lowered for token in ("lime", "lemon", "orange", "grapefruit", "pineapple", "cucumber", "mint", "basil")):
        return "Produce"
    if any(token in lowered for token in ("soda", "tonic", "cola", "ginger beer", "ginger ale", "club soda")):
        return "Mixer"
    if any(token in lowered for token in ("sugar", "salt", "powder", "spice", "cocoa")):
        return "Pantry"
    if is_alcoholic:
        if any(token in lowered or token in sub for token in ("vermouth", "amaro", "aperitif", "liqueur", "cordial", "schnapps")):
            return "Modifier"
        if any(token in lowered or token in sub for token in ("wine", "sherry", "port", "madeira", "cider", "beer")):
            return "Wine & Beer"
        return "Spirit"
    return "Mixer"


def _infer_unit(name: str, category: Optional[str], subcategory: Optional[str], is_alcoholic: bool, is_perishable: bool) -> str:
    lowered = name.lower()
    haystack = " ".join(filter(None, [category, subcategory, lowered])).lower()
    if "bitters" in haystack:
        return "dash"
    if _matches_hint(haystack, COUNT_HINTS):
        return "count"
    if _matches_hint(haystack, WEIGHT_HINTS):
        return "g"
    if is_alcoholic or any(token in haystack for token in ("juice", "syrup", "mixer", "soda", "cream", "milk")):
        return "oz"
    if is_perishable and any(token in haystack for token in ("herb", "produce", "fruit")):
        return "count"
    return "oz"


def _source_reference(label: str, url: Optional[str] = None) -> SourceReference:
    return SourceReference(label=label, url=url)


def _dedupe_source_refs(items: list[SourceReference]) -> list[SourceReference]:
    seen: set[tuple[str, Optional[str]]] = set()
    output: list[SourceReference] = []
    for item in items:
        key = (item.label, item.url)
        if key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output


def _dedupe_strings(items: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        normalized = item.strip()
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(normalized)
    return output


def _is_tabular_content(filename: str, content: str) -> bool:
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".csv", ".tsv"}:
        return True
    first_non_empty = next((line for line in content.splitlines() if line.strip()), "")
    lowered = first_non_empty.lower()
    if not first_non_empty:
        return False
    if any(delimiter in first_non_empty for delimiter in (",", "\t", "|", ";")):
        return any(token in lowered for token in HEADER_ALIASES)
    return False


def _parse_plain_text_rows(content: str) -> list[BatchUploadRow]:
    rows: list[BatchUploadRow] = []
    for line_number, raw_line in enumerate(content.splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        stripped = stripped.lstrip("-*").strip()
        if not stripped:
            continue
        rows.append(BatchUploadRow(row_number=line_number, source_name=_normalize_name(stripped)))
    return rows


def _parse_tabular_rows(filename: str, content: str) -> list[BatchUploadRow]:
    sample = content[:4096]
    if Path(filename or "").suffix.lower() == ".tsv":
        dialect = csv.excel_tab
    else:
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel
    reader = csv.DictReader(io.StringIO(content), dialect=dialect)
    if not reader.fieldnames:
        raise ValueError("The uploaded file must include a header row.")
    mapped_headers = [_normalize_header(header or "") for header in reader.fieldnames]
    if not any(header in HEADER_ALIASES for header in mapped_headers):
        raise ValueError("Could not find a supported name column in the uploaded file.")

    rows: list[BatchUploadRow] = []
    for row_number, raw_row in enumerate(reader, start=2):
        mapped: dict[str, Any] = {}
        for original_header, value in raw_row.items():
            normalized_header = _normalize_header(original_header or "")
            target = HEADER_ALIASES.get(normalized_header)
            if not target:
                continue
            mapped[target] = value

        source_name = _normalize_text(mapped.get("source_name") or mapped.get("canonical_name") or mapped.get("display_name"))
        if not source_name:
            continue
        rows.append(
            BatchUploadRow(
                row_number=row_number,
                source_name=_normalize_name(source_name),
                canonical_name=_normalize_text(mapped.get("canonical_name")),
                display_name=_normalize_text(mapped.get("display_name")),
                category=_normalize_text(mapped.get("category")),
                subcategory=_normalize_text(mapped.get("subcategory")),
                description=_compact_description(mapped.get("description")),
                abv=_parse_float(mapped.get("abv")),
                is_alcoholic=_parse_bool(mapped.get("is_alcoholic")),
                is_perishable=_parse_bool(mapped.get("is_perishable")),
                unit=_normalize_unit(mapped.get("unit")),
                preferred_unit=_normalize_unit(mapped.get("preferred_unit")),
                quantity=_parse_float(mapped.get("quantity")),
                lot_unit=_normalize_unit(mapped.get("lot_unit")),
                location=_normalize_text(mapped.get("location")),
            )
        )
    return rows


def parse_batch_upload(filename: str, content: str) -> list[BatchUploadRow]:
    if not _normalize_text(filename):
        raise ValueError("A filename is required.")
    stripped = (content or "").strip()
    if not stripped:
        raise ValueError("The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_CHARS:
        raise ValueError(f"The uploaded file is too large. Limit uploads to {MAX_UPLOAD_CHARS} characters.")

    rows = _parse_tabular_rows(filename, content) if _is_tabular_content(filename, content) else _parse_plain_text_rows(content)
    if not rows:
        raise ValueError("No ingredient rows were found in the uploaded file.")
    if len(rows) > MAX_UPLOAD_ROWS:
        raise ValueError(f"Upload at most {MAX_UPLOAD_ROWS} rows per batch.")
    invalid_quantities = [row.row_number for row in rows if row.quantity is not None and row.quantity <= 0]
    if invalid_quantities:
        joined = ", ".join(str(value) for value in invalid_quantities[:8])
        raise ValueError(f"Quantity must be greater than zero on row(s): {joined}.")
    return rows


async def _load_existing_ingredients(db: AsyncSession, rows: list[BatchUploadRow]) -> tuple[dict[str, Ingredient], dict[str, Ingredient], dict[str, set[str]]]:
    names = {row.canonical_name.lower() if row.canonical_name else row.source_name.lower() for row in rows}
    ingredient_map: dict[str, Ingredient] = {}
    alias_map: dict[str, Ingredient] = {}
    existing_aliases: dict[str, set[str]] = {}

    if not names:
        return ingredient_map, alias_map, existing_aliases

    ingredient_result = await db.execute(
        select(Ingredient).where(func.lower(Ingredient.canonical_name).in_(names))
    )
    for ingredient in ingredient_result.scalars().all():
        ingredient_map[(ingredient.canonical_name or "").lower()] = ingredient
        existing_aliases[str(ingredient.id)] = set()

    alias_result = await db.execute(
        select(IngredientAlias.alias, Ingredient)
        .join(Ingredient, IngredientAlias.ingredient_id == Ingredient.id)
        .where(func.lower(IngredientAlias.alias).in_(names))
    )
    for alias, ingredient in alias_result.all():
        normalized_alias = (alias or "").strip().lower()
        if normalized_alias:
            alias_map[normalized_alias] = ingredient
        existing_aliases.setdefault(str(ingredient.id), set()).add(normalized_alias)

    return ingredient_map, alias_map, existing_aliases


async def _load_existing_items(db: AsyncSession, user: User, ingredient_ids: list[uuid.UUID]) -> dict[str, list[InventoryItem]]:
    if not ingredient_ids:
        return {}
    result = await db.execute(
        select(InventoryItem)
        .where(InventoryItem.user_id == user.id)
        .where(InventoryItem.ingredient_id.in_(ingredient_ids))
    )
    items_by_ingredient: dict[str, list[InventoryItem]] = {}
    for item in result.scalars().all():
        items_by_ingredient.setdefault(str(item.ingredient_id), []).append(item)
    return items_by_ingredient


async def _lookup_cocktaildb_ingredient(
    name: str,
    telemetry: BatchUploadLookupTelemetry,
) -> tuple[dict[str, Any], list[SourceReference], list[str]]:
    api_key = (settings.cocktaildb_api_key or "").strip()
    base_url = (settings.cocktaildb_api_base_url or "").strip().rstrip("/")
    if not api_key or not base_url:
        return {}, [], []

    source_refs = [_source_reference("TheCocktailDB ingredient reference", "https://www.thecocktaildb.com/api.php")]
    notes: list[str] = []
    query = name.strip()
    if not query:
        return {}, source_refs, notes

    try:
        telemetry.cocktaildb_requests += 1
        record_inventory_batch_lookup("cocktaildb", "request")
        async with httpx.AsyncClient(
            timeout=float(settings.cocktaildb_request_timeout_seconds or 15),
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            response = await client.get(f"{base_url}/{api_key}/search.php", params={"i": query})
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("CocktailDB ingredient lookup failed for %s: %s", query, exc)
        telemetry.cocktaildb_failures += 1
        record_inventory_batch_lookup("cocktaildb", "failure")
        notes.append("TheCocktailDB lookup did not respond cleanly; used fallback heuristics where needed.")
        return {}, source_refs, notes
    record_inventory_batch_lookup("cocktaildb", "success")

    records = payload.get("ingredients") if isinstance(payload, dict) else None
    if not isinstance(records, list) or not records:
        return {}, source_refs, notes

    record: Optional[dict[str, Any]] = None
    lowered = query.lower()
    for candidate in records:
        candidate_name = str(candidate.get("strIngredient") or "").strip().lower()
        if candidate_name == lowered:
            record = candidate
            break
    if record is None:
        record = records[0] if isinstance(records[0], dict) else None
    if record is None:
        return {}, source_refs, notes

    type_value = _normalize_text(record.get("strType"))
    abv = _parse_float(record.get("strABV"))
    is_alcoholic = _parse_bool(record.get("strAlcohol"))
    if is_alcoholic is None:
        is_alcoholic = (abv or 0) > 0
    description = _compact_description(record.get("strDescription"))
    category = _derive_category(name, type_value, bool(is_alcoholic))
    is_perishable = _infer_is_perishable(name, category, type_value, description)
    unit = _infer_unit(name, category, type_value, bool(is_alcoholic), is_perishable)

    return {
        "category": category,
        "subcategory": type_value,
        "description": description,
        "abv": abv,
        "is_alcoholic": bool(is_alcoholic),
        "is_perishable": is_perishable,
        "unit": unit,
        "preferred_unit": unit,
        "confidence": 0.82,
    }, source_refs, notes


def _extract_response_text_and_refs(response: Any) -> tuple[str, list[SourceReference]]:
    texts: list[str] = []
    source_refs: list[SourceReference] = []
    for item in getattr(response, "output", []) or []:
        if getattr(item, "type", None) != "message":
            continue
        for content in getattr(item, "content", []) or []:
            if getattr(content, "type", None) != "output_text":
                continue
            text = getattr(content, "text", "") or ""
            if text:
                texts.append(text)
            for annotation in getattr(content, "annotations", []) or []:
                if getattr(annotation, "type", None) == "url_citation":
                    source_refs.append(
                        _source_reference(
                            getattr(annotation, "title", "Web result") or "Web result",
                            getattr(annotation, "url", None),
                        )
                    )
    return "\n".join(texts).strip(), _dedupe_source_refs(source_refs)


def _extract_openai_usage(response: Any) -> tuple[int, int, int]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return 0, 0, 0

    def _read(name: str) -> int:
        if isinstance(usage, dict):
            value = usage.get(name, 0)
        else:
            value = getattr(usage, name, 0)
        try:
            return max(int(value or 0), 0)
        except (TypeError, ValueError):
            return 0

    input_tokens = _read("input_tokens")
    output_tokens = _read("output_tokens")
    total_tokens = _read("total_tokens")
    if total_tokens <= 0:
        total_tokens = input_tokens + output_tokens
    return input_tokens, output_tokens, total_tokens


async def _lookup_openai_web_details(
    row: BatchUploadRow,
    safety_identifier: str,
    telemetry: BatchUploadLookupTelemetry,
) -> tuple[dict[str, Any], list[SourceReference], list[str]]:
    if settings.llm_provider.lower() != "openai":
        return {}, [], []

    client: AsyncOpenAI
    try:
        client = _get_openai_client()
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenAI client unavailable for inventory batch upload: %s", exc)
        telemetry.openai_failures += 1
        record_inventory_batch_lookup("openai_web", "failure")
        return {}, [], ["OpenAI web lookup is unavailable in this environment."]

    prompt = {
        "ingredient_name": row.source_name,
        "provided_fields": {
            "canonical_name": row.canonical_name,
            "display_name": row.display_name,
            "category": row.category,
            "subcategory": row.subcategory,
            "description": row.description,
            "abv": row.abv,
            "is_alcoholic": row.is_alcoholic,
            "is_perishable": row.is_perishable,
            "unit": row.unit,
            "preferred_unit": row.preferred_unit,
        },
        "required_output": {
            "category": "short bartending-friendly category",
            "subcategory": "short subtype if obvious",
            "description": "one sentence max, <= 220 chars",
            "abv": "number or null",
            "is_alcoholic": "boolean or null",
            "is_perishable": "boolean or null",
            "unit": "one of oz, ml, g, count, dash",
            "preferred_unit": "same as unit unless another of those choices is clearly better",
            "confidence": "0.0-1.0",
            "notes": "short explanation of any uncertainty",
        },
    }
    instructions = (
        "You enrich home-bar inventory ingredients using live web search. "
        "Return JSON only. Do not wrap in markdown. Use null when uncertain. "
        "Do not change the ingredient identity. Keep units limited to oz, ml, g, count, or dash."
    )

    try:
        telemetry.openai_requests += 1
        record_inventory_batch_lookup("openai_web", "request")
        response = await client.responses.create(
            model=_resolve_model(settings.llm_model),
            instructions=instructions,
            input=json.dumps(prompt, ensure_ascii=True),
            tools=[{"type": "web_search_preview", "search_context_size": "low"}],
            temperature=0,
            max_output_tokens=700,
            store=False,
            safety_identifier=safety_identifier,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenAI web lookup failed for %s: %s", row.source_name, exc)
        telemetry.openai_failures += 1
        record_inventory_batch_lookup("openai_web", "failure")
        return {}, [], ["Web lookup failed; used file values and local heuristics instead."]
    input_tokens, output_tokens, total_tokens = _extract_openai_usage(response)
    telemetry.openai_input_tokens += input_tokens
    telemetry.openai_output_tokens += output_tokens
    telemetry.openai_total_tokens += total_tokens
    record_inventory_batch_openai_tokens(input_tokens, output_tokens, total_tokens)

    text, source_refs = _extract_response_text_and_refs(response)
    payload = _extract_json(text)
    if not isinstance(payload, dict):
        telemetry.openai_failures += 1
        record_inventory_batch_lookup("openai_web", "failure")
        return {}, source_refs, ["Web lookup returned an unstructured answer; used fallback heuristics for missing fields."]
    if any(Draft7Validator(WEB_LOOKUP_SCHEMA).iter_errors(payload)):
        telemetry.openai_failures += 1
        record_inventory_batch_lookup("openai_web", "failure")
        return {}, source_refs, ["Web lookup returned invalid structured data; ignored it for safety."]

    payload["description"] = _compact_description(payload.get("description"))
    payload["unit"] = _normalize_unit(payload.get("unit"))
    payload["preferred_unit"] = _normalize_unit(payload.get("preferred_unit"))
    payload["category"] = _normalize_text(payload.get("category"))
    payload["subcategory"] = _normalize_text(payload.get("subcategory"))
    payload["notes"] = _normalize_text(payload.get("notes"))
    record_inventory_batch_lookup("openai_web", "success")
    return payload, source_refs, [payload["notes"]] if payload.get("notes") else []


def _overlay_value(*values: Any) -> Any:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def _match_existing_item(row: BatchUploadRowResult, existing_items: list[InventoryItem]) -> Optional[InventoryItem]:
    if not existing_items:
        return None
    desired_display = _normalize_text(row.display_name)
    if desired_display:
        for item in existing_items:
            if (_normalize_text(item.display_name) or "").lower() == desired_display.lower():
                return item
    if len(existing_items) == 1:
        return existing_items[0]
    return None


def _build_row_result(
    row: BatchUploadRow,
    existing_ingredient: Optional[Ingredient],
    existing_items: list[InventoryItem],
    cocktaildb_values: dict[str, Any],
    cocktaildb_refs: list[SourceReference],
    cocktaildb_notes: list[str],
    web_values: dict[str, Any],
    web_refs: list[SourceReference],
    web_notes: list[str],
) -> BatchUploadRowResult:
    canonical_name = _normalize_name(_overlay_value(existing_ingredient.canonical_name if existing_ingredient else None, row.canonical_name, row.source_name) or row.source_name)
    display_name = _overlay_value(row.display_name, row.source_name if canonical_name.lower() != row.source_name.lower() else None)
    category = _overlay_value(row.category, existing_ingredient.category if existing_ingredient else None, cocktaildb_values.get("category"), web_values.get("category"))
    subcategory = _overlay_value(row.subcategory, existing_ingredient.subcategory if existing_ingredient else None, cocktaildb_values.get("subcategory"), web_values.get("subcategory"))
    description = _compact_description(_overlay_value(row.description, existing_ingredient.description if existing_ingredient else None, cocktaildb_values.get("description"), web_values.get("description")))
    abv = _overlay_value(row.abv, existing_ingredient.abv if existing_ingredient else None, cocktaildb_values.get("abv"), web_values.get("abv"))
    is_alcoholic = _overlay_value(row.is_alcoholic, existing_ingredient.is_alcoholic if existing_ingredient else None, cocktaildb_values.get("is_alcoholic"), web_values.get("is_alcoholic"))
    if is_alcoholic is None:
        is_alcoholic = _infer_is_alcoholic(canonical_name, category, subcategory, abv)
    is_perishable = _overlay_value(row.is_perishable, existing_ingredient.is_perishable if existing_ingredient else None, cocktaildb_values.get("is_perishable"), web_values.get("is_perishable"))
    if is_perishable is None:
        is_perishable = _infer_is_perishable(canonical_name, category, subcategory, description)
    category = _overlay_value(category, _derive_category(canonical_name, subcategory, bool(is_alcoholic)))
    unit = _overlay_value(row.unit, cocktaildb_values.get("unit"), web_values.get("unit"))
    if not unit:
        unit = _infer_unit(canonical_name, category, subcategory, bool(is_alcoholic), bool(is_perishable))
    unit = _normalize_unit(unit) or "oz"
    preferred_unit = _normalize_unit(_overlay_value(row.preferred_unit, web_values.get("preferred_unit"), cocktaildb_values.get("preferred_unit"), unit))
    lot_unit = _normalize_unit(_overlay_value(row.lot_unit, row.unit, unit)) if row.quantity is not None else None
    confidence = _overlay_value(web_values.get("confidence"), cocktaildb_values.get("confidence"), 0.9 if existing_ingredient else None, 0.55)
    notes = _dedupe_strings(cocktaildb_notes + web_notes)
    source_refs = _dedupe_source_refs(cocktaildb_refs + web_refs)

    missing_fields = [
        field_name
        for field_name, value in (("category", category), ("description", description), ("subcategory", subcategory))
        if value is None
    ]
    matched_item = _match_existing_item(
        BatchUploadRowResult(
            row_number=row.row_number,
            source_name=row.source_name,
            canonical_name=canonical_name,
            display_name=display_name,
            category=category,
            subcategory=subcategory,
            description=description,
            abv=abv,
            is_alcoholic=bool(is_alcoholic),
            is_perishable=bool(is_perishable),
            unit=unit,
            preferred_unit=preferred_unit,
            quantity=row.quantity,
            lot_unit=lot_unit,
            location=row.location,
            confidence=float(confidence) if confidence is not None else None,
            status="ready",
            import_action="create_item",
        ),
        existing_items,
    )

    if matched_item and row.quantity is None:
        status = "duplicate"
        import_action = "reuse_item"
        notes = _dedupe_strings(notes + ["This ingredient already exists in your inventory."])
    elif matched_item:
        status = "ready" if not missing_fields else "partial"
        import_action = "reuse_item_add_lot"
    elif existing_ingredient:
        status = "ready" if not missing_fields else "partial"
        import_action = "reuse_ingredient_create_item"
    else:
        status = "ready" if not missing_fields else "partial"
        import_action = "create_ingredient_and_item"

    return BatchUploadRowResult(
        row_number=row.row_number,
        source_name=row.source_name,
        canonical_name=canonical_name,
        display_name=display_name,
        category=category,
        subcategory=subcategory,
        description=description,
        abv=abv,
        is_alcoholic=bool(is_alcoholic),
        is_perishable=bool(is_perishable),
        unit=unit,
        preferred_unit=preferred_unit,
        quantity=row.quantity,
        lot_unit=lot_unit,
        location=row.location,
        confidence=float(confidence) if confidence is not None else None,
        status=status,
        import_action=import_action,
        notes=notes,
        missing_fields=missing_fields,
        source_refs=source_refs,
        ingredient_id=existing_ingredient.id if existing_ingredient else None,
        inventory_item_id=matched_item.id if matched_item else None,
    )


def _lookup_telemetry_payload(telemetry: BatchUploadLookupTelemetry) -> dict[str, int]:
    return {
        "cache_hits": telemetry.cache_hits,
        "cache_misses": telemetry.cache_misses,
        "cocktaildb_requests": telemetry.cocktaildb_requests,
        "cocktaildb_failures": telemetry.cocktaildb_failures,
        "openai_requests": telemetry.openai_requests,
        "openai_failures": telemetry.openai_failures,
        "openai_input_tokens": telemetry.openai_input_tokens,
        "openai_output_tokens": telemetry.openai_output_tokens,
        "openai_total_tokens": telemetry.openai_total_tokens,
    }


def _row_requires_review(row: BatchUploadRowResult) -> bool:
    import_result = (row.import_result or "").lower()
    return (
        row.status == "partial"
        or row.import_action == "create_ingredient_and_item"
        or "created_ingredient" in import_result
        or (row.confidence is not None and row.confidence < 0.75)
    )


def _row_status_counts(rows: list[BatchUploadRowResult]) -> dict[str, int]:
    counts = {"ready": 0, "partial": 0, "duplicate": 0, "skipped": 0}
    for row in rows:
        counts[row.status] = counts.get(row.status, 0) + 1
    return counts


async def _enrich_row(
    row: BatchUploadRow,
    existing_ingredient: Optional[Ingredient],
    existing_items: list[InventoryItem],
    safety_identifier: str,
    semaphore: asyncio.Semaphore,
    telemetry: BatchUploadLookupTelemetry,
) -> BatchUploadRowResult:
    cached = _get_cached_enrichment(row.source_name)
    if cached:
        telemetry.cache_hits += 1
        record_inventory_batch_lookup("cache", "hit")
        return _build_row_result(
            row,
            existing_ingredient=existing_ingredient,
            existing_items=existing_items,
            cocktaildb_values=cached.cocktaildb_values,
            cocktaildb_refs=cached.cocktaildb_refs,
            cocktaildb_notes=cached.cocktaildb_notes,
            web_values=cached.web_values,
            web_refs=cached.web_refs,
            web_notes=cached.web_notes,
        )

    telemetry.cache_misses += 1
    record_inventory_batch_lookup("cache", "miss")
    cocktaildb_values: dict[str, Any] = {}
    cocktaildb_refs: list[SourceReference] = []
    cocktaildb_notes: list[str] = []
    web_values: dict[str, Any] = {}
    web_refs: list[SourceReference] = []
    web_notes: list[str] = []

    async with semaphore:
        cocktaildb_values, cocktaildb_refs, cocktaildb_notes = await _lookup_cocktaildb_ingredient(
            row.source_name,
            telemetry,
        )
        should_use_web = any(
            _overlay_value(
                getattr(existing_ingredient, field_name, None) if existing_ingredient else None,
                getattr(row, field_name, None),
                cocktaildb_values.get(field_name),
            ) is None
            for field_name in ("category", "subcategory", "description")
        )
        if should_use_web:
            web_values, web_refs, web_notes = await _lookup_openai_web_details(row, safety_identifier, telemetry)

    _set_cached_enrichment(
        row.source_name,
        cocktaildb_values=cocktaildb_values,
        cocktaildb_refs=cocktaildb_refs,
        cocktaildb_notes=cocktaildb_notes,
        web_values=web_values,
        web_refs=web_refs,
        web_notes=web_notes,
    )

    return _build_row_result(
        row,
        existing_ingredient=existing_ingredient,
        existing_items=existing_items,
        cocktaildb_values=cocktaildb_values,
        cocktaildb_refs=cocktaildb_refs,
        cocktaildb_notes=cocktaildb_notes,
        web_values=web_values,
        web_refs=web_refs,
        web_notes=web_notes,
    )


def _summary_from_rows(rows: list[BatchUploadRowResult]) -> dict[str, int]:
    summary = {
        "total_rows": len(rows),
        "ready_rows": 0,
        "partial_rows": 0,
        "duplicate_rows": 0,
        "importable_rows": 0,
        "skipped_rows": 0,
        "pending_review_rows": 0,
        "created_ingredients": 0,
        "reused_ingredients": 0,
        "created_items": 0,
        "reused_items": 0,
        "created_lots": 0,
    }
    for row in rows:
        if row.status == "ready":
            summary["ready_rows"] += 1
            summary["importable_rows"] += 1
        elif row.status == "partial":
            summary["partial_rows"] += 1
            summary["importable_rows"] += 1
        elif row.status == "duplicate":
            summary["duplicate_rows"] += 1
        else:
            summary["skipped_rows"] += 1
        if row.status in {"ready", "partial"} and _row_requires_review(row):
            summary["pending_review_rows"] += 1
    return summary


async def preview_inventory_batch_upload(
    db: AsyncSession,
    user: User,
    filename: str,
    content: str,
    *,
    record_metrics: bool = True,
) -> dict[str, Any]:
    rows = parse_batch_upload(filename, content)
    ingredient_map, alias_map, _existing_aliases = await _load_existing_ingredients(db, rows)
    matched_ingredient_ids = {
        ingredient.id
        for row in rows
        for ingredient in [ingredient_map.get((row.canonical_name or row.source_name).lower()) or alias_map.get(row.source_name.lower())]
        if ingredient is not None
    }
    items_by_ingredient = await _load_existing_items(db, user, list(matched_ingredient_ids))

    semaphore = asyncio.Semaphore(LOOKUP_CONCURRENCY)
    safety_identifier = hashlib.sha256(str(user.id).encode("utf-8")).hexdigest()[:32]
    telemetry = BatchUploadLookupTelemetry()
    preview_rows = await asyncio.gather(
        *[
            _enrich_row(
                row,
                existing_ingredient=ingredient_map.get((row.canonical_name or row.source_name).lower()) or alias_map.get(row.source_name.lower()),
                existing_items=items_by_ingredient.get(
                    str((ingredient_map.get((row.canonical_name or row.source_name).lower()) or alias_map.get(row.source_name.lower())).id),
                    [],
                )
                if (ingredient_map.get((row.canonical_name or row.source_name).lower()) or alias_map.get(row.source_name.lower()))
                else [],
                safety_identifier=safety_identifier,
                semaphore=semaphore,
                telemetry=telemetry,
            )
            for row in rows
        ]
    )

    summary = _summary_from_rows(preview_rows)
    if record_metrics:
        record_inventory_batch_upload_request("preview", "success")
        record_inventory_batch_upload_row_statuses("preview", _row_status_counts(preview_rows))
    return {
        "filename": filename,
        "applied": False,
        "summary": summary,
        "lookup_telemetry": _lookup_telemetry_payload(telemetry),
        "rows": [row_to_payload(row) for row in preview_rows],
    }


async def _infer_expiry_date_for_row(db: AsyncSession, row: BatchUploadRowResult, inventory_item: InventoryItem) -> Optional[datetime]:
    rule_result = await db.execute(
        select(ExpiryRule)
        .where(ExpiryRule.ingredient_id == inventory_item.ingredient_id)
        .order_by(ExpiryRule.days.desc())
        .limit(1)
    )
    rule = rule_result.scalars().first()
    if not rule and row.category:
        category_query = (
            select(ExpiryRule)
            .where(ExpiryRule.category == row.category)
            .order_by(ExpiryRule.days.desc())
            .limit(1)
        )
        if row.subcategory:
            category_query = (
                select(ExpiryRule)
                .where(ExpiryRule.category == row.category)
                .where((ExpiryRule.subcategory == row.subcategory) | (ExpiryRule.subcategory.is_(None)))
                .order_by(ExpiryRule.days.desc())
                .limit(1)
            )
        category_result = await db.execute(category_query)
        rule = category_result.scalars().first()
    if not rule:
        return None
    return datetime.utcnow() + timedelta(days=rule.days)


def _review_status_for_row(row: BatchUploadRowResult) -> str:
    return "pending" if _row_requires_review(row) else "approved"


def _build_audit_record(
    user: User,
    filename: str,
    row: BatchUploadRowResult,
) -> InventoryBatchUploadAudit:
    return InventoryBatchUploadAudit(
        id=uuid.uuid4(),
        user_id=user.id,
        user_email=user.email,
        ingredient_id=row.ingredient_id,
        inventory_item_id=row.inventory_item_id,
        inventory_lot_id=row.inventory_lot_id,
        filename=filename,
        source_name=row.source_name,
        canonical_name=row.canonical_name,
        row_status=row.status,
        import_action=row.import_action,
        import_result=row.import_result,
        review_status=_review_status_for_row(row),
        confidence=row.confidence,
        missing_fields=list(row.missing_fields),
        notes=list(row.notes),
        source_refs=[{"label": ref.label, "url": ref.url} for ref in row.source_refs],
        resolved_payload=row_to_payload(row)["resolved"],
    )


async def apply_inventory_batch_upload(db: AsyncSession, user: User, filename: str, content: str) -> dict[str, Any]:
    preview = await preview_inventory_batch_upload(db, user, filename, content, record_metrics=False)
    rows = [payload_to_row_result(row) for row in preview["rows"]]

    created_ingredient_cache: dict[str, Ingredient] = {}
    created_item_cache: dict[tuple[str, str], InventoryItem] = {}
    ingredient_aliases_cache: dict[str, set[str]] = {}

    for row in rows:
        if row.status == "duplicate":
            if row.ingredient_id:
                preview["summary"]["reused_ingredients"] += 1
            if row.inventory_item_id:
                preview["summary"]["reused_items"] += 1
            row.import_result = "reused_existing_item"
            continue
        if row.status not in {"ready", "partial"}:
            row.import_result = "skipped"
            continue

        ingredient: Optional[Ingredient] = None
        if row.ingredient_id:
            ingredient = await db.get(Ingredient, row.ingredient_id)
        ingredient_key = row.canonical_name.lower()
        if ingredient is None:
            ingredient = created_ingredient_cache.get(ingredient_key)
        if ingredient is None:
            ingredient = Ingredient(
                id=uuid.uuid4(),
                canonical_name=row.canonical_name,
                category=row.category,
                subcategory=row.subcategory,
                description=row.description,
                abv=row.abv,
                is_alcoholic=row.is_alcoholic,
                is_perishable=row.is_perishable,
            )
            db.add(ingredient)
            created_ingredient_cache[ingredient_key] = ingredient
            row.ingredient_id = ingredient.id
            row.import_result = "created_ingredient"
            preview["summary"]["created_ingredients"] += 1
        else:
            row.ingredient_id = ingredient.id
            if not ingredient.category and row.category:
                ingredient.category = row.category
            if not ingredient.subcategory and row.subcategory:
                ingredient.subcategory = row.subcategory
            if not ingredient.description and row.description:
                ingredient.description = row.description
            if ingredient.abv is None and row.abv is not None:
                ingredient.abv = row.abv
            if not ingredient.is_alcoholic and row.is_alcoholic:
                ingredient.is_alcoholic = True
            if not ingredient.is_perishable and row.is_perishable:
                ingredient.is_perishable = True
            preview["summary"]["reused_ingredients"] += 1
            if row.import_result is None:
                row.import_result = "reused_ingredient"

        normalized_alias = row.source_name.strip().lower()
        if normalized_alias and normalized_alias != row.canonical_name.strip().lower():
            known_aliases = ingredient_aliases_cache.setdefault(str(ingredient.id), set())
            if normalized_alias not in known_aliases:
                alias = IngredientAlias(id=uuid.uuid4(), ingredient_id=ingredient.id, alias=row.source_name)
                db.add(alias)
                known_aliases.add(normalized_alias)

        item: Optional[InventoryItem] = None
        if row.inventory_item_id:
            item = await db.get(InventoryItem, row.inventory_item_id)
        item_cache_key = (str(ingredient.id), (row.display_name or "").strip().lower())
        if item is None:
            item = created_item_cache.get(item_cache_key)
        if item is None and row.import_action in {"reuse_item", "reuse_item_add_lot"} and row.inventory_item_id:
            item = await db.get(InventoryItem, row.inventory_item_id)

        if item is None:
            item = InventoryItem(
                id=uuid.uuid4(),
                user_id=user.id,
                ingredient_id=ingredient.id,
                display_name=row.display_name,
                unit=row.unit,
                preferred_unit=row.preferred_unit,
                unit_to_ml=None,
            )
            db.add(item)
            created_item_cache[item_cache_key] = item
            row.inventory_item_id = item.id
            preview["summary"]["created_items"] += 1
            row.import_result = "created_item" if row.import_result is None else f"{row.import_result}, created_item"
        else:
            row.inventory_item_id = item.id
            preview["summary"]["reused_items"] += 1
            if row.import_result is None:
                row.import_result = "reused_item"

        if row.quantity is not None:
            lot = InventoryLot(
                id=uuid.uuid4(),
                inventory_item_id=item.id,
                quantity=row.quantity,
                unit=row.lot_unit or row.unit,
                abv=row.abv,
                purchase_date=datetime.utcnow(),
                expiry_date=await _infer_expiry_date_for_row(db, row, item),
                location=row.location,
                lot_notes="Imported from AI-assisted ingredient batch upload.",
            )
            db.add(lot)
            row.inventory_lot_id = lot.id
            preview["summary"]["created_lots"] += 1
            row.import_result = "created_lot" if row.import_result is None else f"{row.import_result}, created_lot"

        if row.status in {"ready", "partial"} and row.ingredient_id:
            db.add(_build_audit_record(user, filename, row))

    await db.commit()
    record_inventory_batch_upload_request("import", "success")
    record_inventory_batch_upload_row_statuses("import", _row_status_counts(rows))
    preview["applied"] = True
    preview["rows"] = [row_to_payload(row) for row in rows]
    return preview


def row_to_payload(row: BatchUploadRowResult) -> dict[str, Any]:
    return {
        "row_number": row.row_number,
        "source_name": row.source_name,
        "status": row.status,
        "import_action": row.import_action,
        "confidence": row.confidence,
        "notes": row.notes,
        "missing_fields": row.missing_fields,
        "ingredient_id": row.ingredient_id,
        "inventory_item_id": row.inventory_item_id,
        "inventory_lot_id": row.inventory_lot_id,
        "import_result": row.import_result,
        "source_refs": [{"label": ref.label, "url": ref.url} for ref in row.source_refs],
        "resolved": {
            "canonical_name": row.canonical_name,
            "display_name": row.display_name,
            "category": row.category,
            "subcategory": row.subcategory,
            "description": row.description,
            "abv": row.abv,
            "is_alcoholic": row.is_alcoholic,
            "is_perishable": row.is_perishable,
            "unit": row.unit,
            "preferred_unit": row.preferred_unit,
            "quantity": row.quantity,
            "lot_unit": row.lot_unit,
            "location": row.location,
        },
    }


def _uuid_or_none(value: Any) -> Optional[uuid.UUID]:
    if value is None or isinstance(value, uuid.UUID):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return uuid.UUID(text)
    except ValueError:
        return None


def payload_to_row_result(payload: dict[str, Any]) -> BatchUploadRowResult:
    resolved = payload.get("resolved") or {}
    source_refs = [SourceReference(**ref) for ref in payload.get("source_refs") or []]
    return BatchUploadRowResult(
        row_number=payload["row_number"],
        source_name=payload["source_name"],
        canonical_name=resolved.get("canonical_name") or payload["source_name"],
        display_name=resolved.get("display_name"),
        category=resolved.get("category"),
        subcategory=resolved.get("subcategory"),
        description=resolved.get("description"),
        abv=resolved.get("abv"),
        is_alcoholic=bool(resolved.get("is_alcoholic")),
        is_perishable=bool(resolved.get("is_perishable")),
        unit=resolved.get("unit") or "oz",
        preferred_unit=resolved.get("preferred_unit"),
        quantity=resolved.get("quantity"),
        lot_unit=resolved.get("lot_unit"),
        location=resolved.get("location"),
        confidence=payload.get("confidence"),
        status=payload.get("status") or "partial",
        import_action=payload.get("import_action") or "create_ingredient_and_item",
        notes=list(payload.get("notes") or []),
        missing_fields=list(payload.get("missing_fields") or []),
        source_refs=source_refs,
        ingredient_id=_uuid_or_none(payload.get("ingredient_id")),
        inventory_item_id=_uuid_or_none(payload.get("inventory_item_id")),
        inventory_lot_id=_uuid_or_none(payload.get("inventory_lot_id")),
        import_result=payload.get("import_result"),
    )
