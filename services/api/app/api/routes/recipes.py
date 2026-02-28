from typing import Dict, List, Optional, Tuple

from difflib import SequenceMatcher
from datetime import datetime, timedelta
import json
import re
import uuid

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_active_user, optional_user
from app.core.rate_limit import limiter
from app.core.schema_validation import validate_schema
from app.core.config import settings
from app.core.metrics import record_auto_harvest_metrics, record_harvest_job_metrics
from app.core.paths import resolve_schema_dir
from app.domain.embeddings import ensure_recipe_embedding, rebuild_recipe_embeddings, EMBEDDING_MODEL
from app.domain.harvester import (
    match_policy,
    compute_popularity_score,
    compute_quality_score,
    DEFAULT_POLICIES,
    SourcePolicy,
    ingredient_jaccard_similarity,
    normalize_ingredient_name,
    normalize_recipe_name,
)
from app.domain.harvester_pipeline import (
    fetch_html,
    parse_recipe_from_html,
    parse_recipe_with_recovery,
    crawl_source,
    ParsedRecipe,
    evaluate_page_compliance,
    classify_fetch_failure,
    classify_parse_failure,
)
from app.db.session import get_db
from app.db.models.recipe import (
    Recipe,
    RecipeSource,
    RecipeEmbedding,
    RecipeIngredient,
    RecipeSourcePolicy,
    RecipeHarvestJob,
    RecipeVariant,
)
from app.db.models.review import RecipeModeration
from app.schemas.recipe import (
    RecipeCreate,
    RecipeRead,
    RecipeIngest,
    RecipeHarvestRequest,
    RecipeHarvestResponse,
    RecipeHarvestJobCreate,
    RecipeHarvestJobRead,
    SourceDiscoveryRequest,
    SourceDiscoveryResponse,
    RecipeHarvestAutoRequest,
    RecipeHarvestAutoResponse,
    RecipeIngredient as IngredientSchema,
)
from app.schemas.source_policy import RecipeSourcePolicyRead
from app.db.models.user import User


router = APIRouter()
AUTO_HARVEST_CACHE_TTL_SECONDS = 300
AUTO_HARVEST_CACHE_MAX_ENTRIES = 256
_auto_harvest_cache: Dict[str, Tuple[datetime, object]] = {}


def _auto_harvest_cache_key(payload: RecipeHarvestAutoRequest, policy: SourcePolicy) -> str:
    key_data = {
        "source_url": payload.source_url,
        "source_type": payload.source_type,
        "max_pages": payload.max_pages,
        "max_recipes": payload.max_recipes,
        "crawl_depth": payload.crawl_depth,
        "max_links": payload.max_links,
        "respect_robots": payload.respect_robots,
        "policy_domain": policy.domain,
        "parser_settings": policy.parser_settings or {},
    }
    return json.dumps(key_data, sort_keys=True, separators=(",", ":"))


def _get_cached_auto_harvest_result(cache_key: str):
    cached = _auto_harvest_cache.get(cache_key)
    if not cached:
        return None
    created_at, result = cached
    if datetime.utcnow() - created_at > timedelta(seconds=AUTO_HARVEST_CACHE_TTL_SECONDS):
        _auto_harvest_cache.pop(cache_key, None)
        return None
    return result


def _set_cached_auto_harvest_result(cache_key: str, result: object) -> None:
    _auto_harvest_cache[cache_key] = (datetime.utcnow(), result)
    if len(_auto_harvest_cache) <= AUTO_HARVEST_CACHE_MAX_ENTRIES:
        return
    oldest_key = min(_auto_harvest_cache.items(), key=lambda item: item[1][0])[0]
    _auto_harvest_cache.pop(oldest_key, None)


def _confidence_bucket(score: float) -> str:
    if score >= 0.8:
        return "high"
    if score >= 0.6:
        return "medium"
    return "low"


@router.get("/sources")
async def list_sources(db: AsyncSession = Depends(get_db)):
    policies = await _load_source_policies(db, include_inactive=False)
    return [
        {
            "name": policy.name,
            "domain": policy.domain,
            "metric_type": policy.metric_type,
            "min_rating_count": policy.min_rating_count,
            "min_rating_value": policy.min_rating_value,
            "review_policy": policy.review_policy,
            "is_active": policy.is_active,
            "seed_urls": policy.seed_urls or [],
            "crawl_depth": policy.crawl_depth,
            "max_pages": policy.max_pages,
            "max_recipes": policy.max_recipes,
            "crawl_interval_minutes": policy.crawl_interval_minutes,
            "respect_robots": policy.respect_robots,
            "parser_settings": policy.parser_settings or {},
            "alert_settings": policy.alert_settings or {},
        }
        for policy in policies
    ]


@router.post("/harvest/discover", response_model=SourceDiscoveryResponse)
async def discover_sources(payload: SourceDiscoveryRequest, db: AsyncSession = Depends(get_db)):
    policies = await _load_source_policies(db, include_inactive=False)
    allowed = []
    blocked = []
    for url in payload.urls:
        policy = match_policy(url, policies)
        if policy:
            allowed.append(url)
        else:
            blocked.append({"url": url, "reason": "Source not allowed"})
    return SourceDiscoveryResponse(allowed=allowed, blocked=blocked)


@router.get("/harvest/policies", response_model=List[RecipeSourcePolicyRead])
async def list_harvest_policies(
    db: AsyncSession = Depends(get_db),
    internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
    user: Optional[User] = Depends(optional_user),
    limit: int = 50,
):
    if internal_token != settings.internal_token and (not user or user.role != "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    result = await db.execute(
        select(RecipeSourcePolicy)
        .where(RecipeSourcePolicy.is_active == True)  # noqa: E712
        .order_by(RecipeSourcePolicy.name)
        .limit(limit)
    )
    return list(result.scalars().all())


@router.post("/harvest/auto", response_model=RecipeHarvestAutoResponse)
@limiter.limit(f"{settings.rate_limit_auto_harvest_per_minute}/minute")
async def auto_harvest(
    payload: RecipeHarvestAutoRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
    user: Optional[User] = Depends(optional_user),
):
    if internal_token == settings.internal_token:
        if not user:
            result = await db.execute(select(User).where(User.role == "admin").order_by(User.created_at.asc()))
            user = result.scalars().first()
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No admin user available for internal harvest",
                )
    elif not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    policies = await _load_source_policies(db, include_inactive=False)
    policy = match_policy(payload.source_url, policies)
    if not policy:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Source not allowed")
    cache_key = _auto_harvest_cache_key(payload, policy)
    crawl_result = _get_cached_auto_harvest_result(cache_key)
    if crawl_result is None:
        crawl_result = await crawl_source(
            payload.source_url,
            max_pages=payload.max_pages,
            max_recipes=payload.max_recipes,
            crawl_depth=payload.crawl_depth,
            max_links=payload.max_links,
            respect_robots=payload.respect_robots,
            parser_settings=policy.parser_settings or {},
        )
        _set_cached_auto_harvest_result(cache_key, crawl_result)
    discovered_urls = crawl_result.discovered_urls
    parsed_recipes = crawl_result.parsed_recipes
    queued_job_ids: list[uuid.UUID] = []
    skip_reason_counts: dict[str, int] = {}
    for parsed in parsed_recipes:
        url = parsed.source_url
        if not url:
            skip_reason_counts["missing_url"] = skip_reason_counts.get("missing_url", 0) + 1
            continue
        if not match_policy(url, policies):
            skip_reason_counts["not_allowed"] = skip_reason_counts.get("not_allowed", 0) + 1
            continue
        if policy.metric_type == "ratings":
            rating_ok = (parsed.rating_value or 0.0) >= (policy.min_rating_value or 0.0)
            has_social = (parsed.like_count or 0) > 0 or (parsed.share_count or 0) > 0
            if ((parsed.rating_count or 0) < policy.min_rating_count or not rating_ok) and not has_social:
                skip_reason_counts["insufficient_signals"] = skip_reason_counts.get("insufficient_signals", 0) + 1
                continue
        existing_source = await db.execute(select(RecipeSource).where(RecipeSource.url == url))
        if existing_source.scalars().first():
            skip_reason_counts["existing_source"] = skip_reason_counts.get("existing_source", 0) + 1
            continue
        existing_job = await db.execute(
            select(RecipeHarvestJob)
            .where(RecipeHarvestJob.source_url == url)
            .where(RecipeHarvestJob.status.in_(["pending", "running"]))
        )
        if existing_job.scalars().first():
            skip_reason_counts["existing_job_pending_or_running"] = skip_reason_counts.get(
                "existing_job_pending_or_running", 0
            ) + 1
            continue
        if payload.enqueue:
            raw_text = _render_raw_text(parsed) if parsed.ingredients and parsed.instructions else None
            confidence_bucket = _confidence_bucket(parsed.extraction_confidence)
            parse_strategy = f"{parsed.parser_used}@{confidence_bucket}"
            if parsed.parser_used == "dom_fallback":
                parse_strategy = (
                    f"dom_fallback:{parsed.fallback_class or 'unclassified'}@{confidence_bucket}"
                )
            job = RecipeHarvestJob(
                user_id=user.id,
                source_url=url,
                source_type=payload.source_type,
                raw_text=raw_text,
                canonical_name=parsed.canonical_name,
                author=parsed.author,
                rating_value=parsed.rating_value,
                rating_count=parsed.rating_count,
                like_count=parsed.like_count,
                share_count=parsed.share_count,
                status="pending",
                parse_strategy=parse_strategy,
            )
            db.add(job)
            await db.flush()
            queued_job_ids.append(job.id)
    await db.commit()
    record_auto_harvest_metrics(
        source_url=payload.source_url,
        parser_stats=crawl_result.parser_stats,
        fallback_class_counts=crawl_result.fallback_class_counts,
        parse_failure_counts=crawl_result.parse_failure_counts,
        compliance_reason_counts=crawl_result.compliance_reason_counts,
    )
    return RecipeHarvestAutoResponse(
        status="ok",
        discovered_urls=discovered_urls,
        parsed_count=len(parsed_recipes),
        queued_job_ids=queued_job_ids,
        parser_stats=crawl_result.parser_stats,
        confidence_buckets=crawl_result.confidence_buckets,
        fallback_class_counts=crawl_result.fallback_class_counts,
        parse_failure_counts=crawl_result.parse_failure_counts,
        compliance_rejections=crawl_result.compliance_rejections,
        compliance_reason_counts=crawl_result.compliance_reason_counts,
        skip_reason_counts=skip_reason_counts,
        errors=crawl_result.errors,
    )


async def _load_source_policies(db: AsyncSession, include_inactive: bool) -> list[SourcePolicy]:
    query = select(RecipeSourcePolicy)
    if not include_inactive:
        query = query.where(RecipeSourcePolicy.is_active == True)  # noqa: E712
    result = await db.execute(query.order_by(RecipeSourcePolicy.name))
    rows = list(result.scalars().all())
    if not rows:
        return DEFAULT_POLICIES
    policies = [
        SourcePolicy(
            name=row.name,
            domain=row.domain,
            metric_type=row.metric_type,
            min_rating_count=row.min_rating_count or 0,
            min_rating_value=row.min_rating_value or 0.0,
            review_policy=row.review_policy or "manual",
            is_active=row.is_active,
            seed_urls=row.seed_urls or [],
            crawl_depth=row.crawl_depth or 2,
            max_pages=row.max_pages or 40,
            max_recipes=row.max_recipes or 20,
            crawl_interval_minutes=row.crawl_interval_minutes or 240,
            respect_robots=row.respect_robots if row.respect_robots is not None else True,
            parser_settings=row.parser_settings or {},
            alert_settings=row.alert_settings or {},
        )
        for row in rows
    ]
    return policies


def _apply_overrides(recipe: Recipe, overrides: Optional[dict]) -> dict:
    payload = RecipeRead.model_validate(recipe).model_dump()
    if not overrides:
        return payload
    mapped = dict(overrides)
    if "ingredients" in mapped and "ingredient_rows" not in mapped:
        mapped["ingredient_rows"] = mapped.pop("ingredients")
    for key in [
        "canonical_name",
        "description",
        "ingredient_rows",
        "instructions",
        "glassware_id",
        "ice_style",
        "tags",
        "review_status",
        "quality_label",
    ]:
        if key in mapped and mapped[key] is not None:
            payload[key] = mapped[key]
    return payload


async def _load_overrides(db: AsyncSession, recipe_ids: list) -> dict[str, dict]:
    if not recipe_ids:
        return {}
    result = await db.execute(
        select(RecipeModeration)
        .where(RecipeModeration.recipe_id.in_(recipe_ids))
        .order_by(RecipeModeration.created_at.desc())
    )
    overrides: dict[str, dict] = {}
    for moderation in result.scalars().all():
        recipe_id = str(moderation.recipe_id)
        if recipe_id in overrides:
            continue
        if moderation.status != "approved":
            continue
        if not moderation.overrides:
            continue
        overrides[recipe_id] = moderation.overrides
    return overrides

SCHEMA_DIR = resolve_schema_dir()


@router.post("", response_model=RecipeRead)
async def create_recipe(
    payload: RecipeCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    recipe = Recipe(**payload.model_dump(exclude={"ingredients"}))
    db.add(recipe)
    await db.flush()
    if payload.ingredients:
        ingredient_rows = []
        for ingredient in payload.ingredients:
            row = RecipeIngredient(recipe_id=recipe.id, **ingredient.model_dump())
            db.add(row)
            ingredient_rows.append(row)
        recipe.ingredient_rows = ingredient_rows
    await db.commit()
    await db.refresh(recipe)
    await ensure_recipe_embedding(db, recipe)
    await db.commit()
    return recipe


@router.get("", response_model=List[RecipeRead])
async def list_recipes(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    query = (
        select(Recipe)
        .options(selectinload(Recipe.ingredient_rows))
        .order_by(Recipe.canonical_name)
        .offset(offset)
        .limit(limit)
    )
    if q:
        query = query.where(Recipe.canonical_name.ilike(f"%{q}%"))
    result = await db.execute(query)
    recipes = list(result.unique().scalars().all())
    overrides = await _load_overrides(db, [recipe.id for recipe in recipes])
    return [_apply_overrides(recipe, overrides.get(str(recipe.id))) for recipe in recipes]


@router.get("/{recipe_id}", response_model=RecipeRead)
async def get_recipe(
    recipe_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    recipe = await db.get(Recipe, recipe_id, options=[joinedload(Recipe.ingredient_rows)])
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    overrides = await _load_overrides(db, [recipe.id])
    return _apply_overrides(recipe, overrides.get(str(recipe.id)))


@router.post("/ingest", response_model=RecipeRead)
@limiter.limit(f"{settings.rate_limit_ingest_per_minute}/minute")
async def ingest_recipe(
    payload: RecipeIngest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    schema_path = SCHEMA_DIR / "recipe_extraction.json"
    try:
        validate_schema(schema_path, payload.model_dump(mode="json"))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    policies = await _load_source_policies(db, include_inactive=False)
    policy = match_policy(payload.source.url, policies)
    if not policy:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Source not allowed")
    popularity_score = compute_popularity_score(
        payload.rating_value, payload.rating_count, payload.like_count, payload.share_count
    )
    rating_count = payload.rating_count or 0
    rating_value = payload.rating_value or 0.0
    has_social = (payload.like_count or 0) > 0 or (payload.share_count or 0) > 0
    pervasiveness = False
    existing_result = await db.execute(
        select(Recipe).where(func.lower(Recipe.canonical_name) == payload.canonical_name.lower())
    )
    existing = existing_result.scalars().first()
    if existing:
        source_count = await db.execute(
            select(func.count(RecipeSource.id)).where(RecipeSource.recipe_id == existing.id)
        )
        pervasiveness = (source_count.scalar() or 0) >= 1
    if policy.metric_type == "ratings":
        rating_ok = rating_value >= (policy.min_rating_value or 0.0)
        if (rating_count < policy.min_rating_count or not rating_ok) and not has_social:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient rating signals")
    elif not pervasiveness and popularity_score == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Popularity signal required")

    quality_score = popularity_score + (0.5 if pervasiveness else 0.0)
    review_status = "pending"
    quality_label = None
    rating_ok = rating_value >= (policy.min_rating_value or 0.0)
    if policy.review_policy == "auto" and rating_count >= policy.min_rating_count and rating_ok:
        review_status = "approved"
        quality_label = "auto-approved"
    recipe = Recipe(
        canonical_name=payload.canonical_name,
        description=payload.description,
        instructions=payload.instructions,
        ice_style=payload.ice_style,
        tags=payload.tags,
        review_status=review_status,
        quality_label=quality_label,
    )
    db.add(recipe)
    await db.flush()
    ingredient_rows = []
    for ingredient in payload.ingredients:
        row = RecipeIngredient(recipe_id=recipe.id, **ingredient.model_dump())
        db.add(row)
        ingredient_rows.append(row)
    recipe.ingredient_rows = ingredient_rows
    source = RecipeSource(
        recipe_id=recipe.id,
        url=payload.source.url,
        source_type=payload.source.source_type,
        author=payload.source.author,
        published_at=payload.source.published_at,
        credibility_score=quality_score,
    )
    db.add(source)
    await db.commit()
    await db.refresh(recipe)
    await ensure_recipe_embedding(db, recipe)
    await db.commit()
    return recipe


def _parse_ingredient_line(line: str) -> IngredientSchema:
    match = re.match(r"^(?P<qty>[0-9]+(?:\.[0-9]+)?)\s*(?P<unit>[a-zA-Z]+)?\s+(?P<name>.+)$", line)
    if match:
        qty = float(match.group("qty"))
        unit = (match.group("unit") or "unit").lower()
        name = match.group("name").strip()
        return IngredientSchema(name=name, quantity=qty, unit=unit)
    return IngredientSchema(name=line.strip(), quantity=1.0, unit="unit")


def _parse_raw_text(raw_text: str, canonical_name: Optional[str]) -> Tuple[str, list[IngredientSchema], list[str]]:
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    if not lines:
        return canonical_name or "", [], []
    name = canonical_name or lines[0]
    ingredients: list[IngredientSchema] = []
    instructions: list[str] = []
    mode: Optional[str] = None
    for line in lines[1:]:
        lower = line.lower()
        if lower.startswith("ingredients"):
            mode = "ingredients"
            continue
        if lower.startswith("instructions") or lower.startswith("method"):
            mode = "instructions"
            continue
        if mode == "ingredients" or line.startswith("-") or line.startswith("*"):
            cleaned = line.lstrip("-* ").strip()
            ingredients.append(_parse_ingredient_line(cleaned))
        elif mode == "instructions":
            instructions.append(line.lstrip("0123456789. ").strip())
    if not ingredients:
        for line in lines:
            if any(unit in line.lower() for unit in ["oz", "ml", "tsp", "tbsp", "cup"]):
                ingredients.append(_parse_ingredient_line(line))
    if not instructions:
        ingredient_names = {ing.name for ing in ingredients}
        instructions = [line for line in lines[1:] if line not in ingredient_names]
    return name, ingredients, instructions


def _render_raw_text(parsed: ParsedRecipe) -> str:
    lines: list[str] = ["Ingredients"]
    for ingredient in parsed.ingredients:
        qty = ingredient.get("quantity") or 1.0
        unit = ingredient.get("unit") or "unit"
        name = ingredient.get("name") or ""
        lines.append(f"- {qty} {unit} {name}".strip())
    lines.append("Instructions")
    for step in parsed.instructions:
        if step:
            lines.append(f"- {step}")
    return "\n".join(lines)


def _ingredient_signature(rows: list[IngredientSchema]) -> set[str]:
    return {
        normalize_ingredient_name(ingredient.name)
        for ingredient in rows
        if normalize_ingredient_name(ingredient.name)
    }


def _instruction_signature(instructions: list[str]) -> set[str]:
    stop_words = {
        "the",
        "and",
        "with",
        "into",
        "then",
        "for",
        "until",
        "from",
        "glass",
        "ice",
        "over",
    }
    tokens: set[str] = set()
    for line in instructions:
        for token in re.findall(r"[a-z0-9]+", (line or "").lower()):
            if len(token) < 3 or token in stop_words:
                continue
            tokens.add(token)
    return tokens


def _jaccard_similarity(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


async def _find_related_recipe(
    db: AsyncSession,
    name: str,
    ingredients: list[IngredientSchema],
    instructions: Optional[list[str]] = None,
) -> tuple[Optional[Recipe], float, bool]:
    normalized_name = normalize_recipe_name(name)
    signature = _ingredient_signature(ingredients)
    instruction_signature = _instruction_signature(instructions or [])

    result = await db.execute(select(Recipe).options(joinedload(Recipe.ingredient_rows)))
    candidates = list(result.unique().scalars().all())
    best_recipe: Optional[Recipe] = None
    best_score = 0.0
    best_duplicate = False

    for candidate in candidates:
        candidate_name = normalize_recipe_name(candidate.canonical_name or "")
        candidate_signature = {
            normalize_ingredient_name(row.name) for row in (candidate.ingredient_rows or [])
        }
        candidate_instructions = candidate.instructions if isinstance(candidate.instructions, list) else []
        candidate_instruction_signature = _instruction_signature([str(step) for step in candidate_instructions])
        name_similarity = SequenceMatcher(None, normalized_name, candidate_name).ratio()
        ingredient_similarity = ingredient_jaccard_similarity(signature, candidate_signature)
        instruction_similarity = _jaccard_similarity(instruction_signature, candidate_instruction_signature)
        score = (
            (name_similarity * 0.45)
            + (ingredient_similarity * 0.4)
            + (instruction_similarity * 0.15)
        )

        is_duplicate = (
            (normalized_name == candidate_name and ingredient_similarity >= 0.55)
            or ingredient_similarity >= 0.92
            or (name_similarity >= 0.95 and ingredient_similarity >= 0.55)
            or (ingredient_similarity >= 0.84 and instruction_similarity >= 0.5)
        )
        if not is_duplicate and score < 0.58:
            continue

        if score > best_score:
            best_score = score
            best_recipe = candidate
            best_duplicate = is_duplicate

    return best_recipe, best_score, best_duplicate


async def _perform_harvest_parsed(
    name: str,
    ingredients: list[IngredientSchema],
    instructions: list[str],
    payload: RecipeHarvestRequest,
    policy: SourcePolicy,
    db: AsyncSession,
    description: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> RecipeHarvestResponse:
    popularity_score = compute_popularity_score(
        payload.rating_value, payload.rating_count, payload.like_count, payload.share_count
    )
    rating_count = payload.rating_count or 0
    rating_value = payload.rating_value or 0.0
    has_social = (payload.like_count or 0) > 0 or (payload.share_count or 0) > 0

    related_recipe, similarity_score, is_duplicate = await _find_related_recipe(
        db, name, ingredients, instructions
    )
    pervasiveness_count = 0
    if related_recipe:
        source_count = await db.execute(
            select(func.count(RecipeSource.id)).where(RecipeSource.recipe_id == related_recipe.id)
        )
        pervasiveness_count = int(source_count.scalar() or 0)

    quality_score = compute_quality_score(
        policy=policy,
        ingredient_count=len(ingredients),
        instruction_count=len(instructions),
        popularity_score=popularity_score,
        rating_count=payload.rating_count,
        rating_value=payload.rating_value,
        pervasiveness_count=pervasiveness_count,
    )

    if related_recipe and is_duplicate:
        if policy.metric_type == "ratings":
            rating_ok = rating_value >= (policy.min_rating_value or 0.0)
            if (rating_count < policy.min_rating_count or not rating_ok) and not has_social:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient rating signals")
        elif pervasiveness_count < 1 and popularity_score == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Popularity signal required")
        db.add(
            RecipeSource(
                recipe_id=related_recipe.id,
                url=payload.source_url,
                source_type=payload.source_type,
                author=payload.author,
                credibility_score=quality_score,
            )
        )
        await db.commit()
        return RecipeHarvestResponse(
            status="ok",
            recipe_id=related_recipe.id,
            duplicate=True,
            quality_score=quality_score,
        )

    if policy.metric_type == "ratings":
        rating_ok = rating_value >= (policy.min_rating_value or 0.0)
        if (rating_count < policy.min_rating_count or not rating_ok) and not has_social:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient rating signals")
    review_status = "pending"
    quality_label = None
    rating_ok = rating_value >= (policy.min_rating_value or 0.0)
    if policy.review_policy == "auto" and rating_count >= policy.min_rating_count and rating_ok:
        review_status = "approved"
        quality_label = "auto-approved"
    if quality_score >= 4.0 and not quality_label:
        quality_label = "high-confidence"
    recipe = Recipe(
        canonical_name=name,
        description=description,
        instructions=instructions,
        tags=tags or None,
        review_status=review_status,
        quality_label=quality_label,
    )
    db.add(recipe)
    await db.flush()
    for ingredient in ingredients:
        db.add(RecipeIngredient(recipe_id=recipe.id, **ingredient.model_dump()))
    db.add(
        RecipeSource(
            recipe_id=recipe.id,
            url=payload.source_url,
            source_type=payload.source_type,
            author=payload.author,
            credibility_score=quality_score,
        )
    )
    if related_recipe and similarity_score >= 0.55:
        db.add(
            RecipeVariant(
                recipe_id=recipe.id,
                variant_of_recipe_id=related_recipe.id,
                similarity_score=round(similarity_score, 3),
                notes="Auto-clustered during harvest",
            )
        )
    await db.commit()
    await db.refresh(recipe)
    await ensure_recipe_embedding(db, recipe)
    await db.commit()
    return RecipeHarvestResponse(status="ok", recipe_id=recipe.id, duplicate=False, quality_score=quality_score)


async def _perform_harvest(payload: RecipeHarvestRequest, db: AsyncSession) -> RecipeHarvestResponse:
    policies = await _load_source_policies(db, include_inactive=False)
    policy = match_policy(payload.source_url, policies)
    if not policy:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Source not allowed")
    name, ingredients, instructions = _parse_raw_text(payload.raw_text, payload.canonical_name)
    if len(ingredients) < 2 or len(instructions) < 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Low-quality recipe")
    return await _perform_harvest_parsed(
        name=name,
        ingredients=ingredients,
        instructions=instructions,
        payload=payload,
        policy=policy,
        db=db,
    )


def _compute_next_retry(attempt_count: int) -> Optional[datetime]:
    if attempt_count >= settings.harvest_max_attempts:
        return None
    exponent = max(attempt_count - 1, 0)
    delay_seconds = settings.harvest_retry_base_seconds * (2**exponent)
    delay_seconds = min(delay_seconds, settings.harvest_retry_max_seconds)
    return datetime.utcnow() + timedelta(seconds=delay_seconds)


@router.post("/harvest", response_model=RecipeHarvestResponse)
@limiter.limit(f"{settings.rate_limit_harvest_per_minute}/minute")
async def harvest_recipe(
    payload: RecipeHarvestRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    return await _perform_harvest(payload, db)


@router.post("/harvest/jobs", response_model=RecipeHarvestJobRead)
async def create_harvest_job(
    payload: RecipeHarvestJobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    job = RecipeHarvestJob(user_id=user.id, status="pending", **payload.model_dump())
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.get("/harvest/jobs", response_model=List[RecipeHarvestJobRead])
async def list_harvest_jobs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
    status_filter: Optional[str] = None,
):
    query = select(RecipeHarvestJob).where(RecipeHarvestJob.user_id == user.id)
    if status_filter:
        query = query.where(RecipeHarvestJob.status == status_filter)
    result = await db.execute(query.order_by(RecipeHarvestJob.created_at.desc()))
    return list(result.scalars().all())


@router.get("/harvest/jobs/pending", response_model=List[RecipeHarvestJobRead])
async def list_pending_harvest_jobs(
    db: AsyncSession = Depends(get_db),
    internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
    user: Optional[User] = Depends(optional_user),
    limit: int = 20,
):
    if internal_token != settings.internal_token and (not user or user.role != "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    result = await db.execute(
        select(RecipeHarvestJob)
        .where(RecipeHarvestJob.status == "pending")
        .order_by(RecipeHarvestJob.created_at.asc())
        .limit(limit)
    )
    return list(result.scalars().all())


@router.get("/harvest/jobs/retryable", response_model=List[RecipeHarvestJobRead])
async def list_retryable_harvest_jobs(
    db: AsyncSession = Depends(get_db),
    internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
    user: Optional[User] = Depends(optional_user),
    limit: int = 20,
):
    if internal_token != settings.internal_token and (not user or user.role != "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    now = datetime.utcnow()
    result = await db.execute(
        select(RecipeHarvestJob)
        .where(RecipeHarvestJob.status == "failed")
        .where(RecipeHarvestJob.attempt_count < settings.harvest_max_attempts)
        .where((RecipeHarvestJob.next_retry_at.is_(None)) | (RecipeHarvestJob.next_retry_at <= now))
        .order_by(RecipeHarvestJob.updated_at.asc())
        .limit(limit)
    )
    return list(result.scalars().all())


@router.get("/harvest/jobs/{job_id}", response_model=RecipeHarvestJobRead)
async def get_harvest_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    # Static routes like `/harvest/jobs/pending` must be declared before this dynamic route,
    # otherwise Starlette may route those requests into this handler.
    job = await db.get(RecipeHarvestJob, job_id)
    if not job or str(job.user_id) != str(user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@router.post("/harvest/jobs/{job_id}/run", response_model=RecipeHarvestJobRead)
async def run_harvest_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
    user: Optional[User] = Depends(optional_user),
):
    if internal_token != settings.internal_token and (not user or user.role != "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    job = await db.get(RecipeHarvestJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if job.status not in {"pending", "failed"}:
        return job
    if (job.attempt_count or 0) >= settings.harvest_max_attempts:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Max harvest attempts reached")
    job.status = "running"
    job.error = None
    job.attempt_count = (job.attempt_count or 0) + 1
    job.last_attempt_at = datetime.utcnow()
    await db.commit()
    payload = RecipeHarvestRequest(
        source_url=job.source_url,
        source_type=job.source_type,
        raw_text=job.raw_text or "",
        canonical_name=job.canonical_name,
        author=job.author,
        rating_value=job.rating_value,
        rating_count=job.rating_count,
        like_count=job.like_count,
        share_count=job.share_count,
    )
    try:
        if job.raw_text:
            # Preserve parse strategy from discovery (auto-harvest) so crawler telemetry captures
            # domain-specific fallback/recovery behavior even when we ingest via cached raw_text.
            if not job.parse_strategy:
                job.parse_strategy = "manual_raw"
            job.compliance_reasons = None
            result = await _perform_harvest(payload, db)
        else:
            try:
                html = await fetch_html(job.source_url)
            except httpx.HTTPError as exc:
                fetch_class = classify_fetch_failure(exc)
                job.parse_strategy = f"fetch_failed:{fetch_class}"
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"fetch_failed ({fetch_class}): {str(exc)}",
                )
            policies = await _load_source_policies(db, include_inactive=False)
            policy = match_policy(job.source_url, policies)
            if not policy:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Source not allowed")
            compliance = evaluate_page_compliance(html, job.source_url, policy.parser_settings or {})
            if not compliance.allowed:
                job.compliance_reasons = compliance.reasons
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Compliance check failed: {', '.join(compliance.reasons)}",
                )
            parsed = parse_recipe_from_html(html, job.source_url, policy.parser_settings or {})
            if not parsed:
                parse_failure = classify_parse_failure(html, job.source_url, policy.parser_settings or {})
                recovered = parse_recipe_with_recovery(
                    html,
                    job.source_url,
                    parse_failure=parse_failure,
                    parser_settings=policy.parser_settings or {},
                )
                if recovered:
                    parsed = recovered
                else:
                    job.parse_strategy = f"parse_failed:{parse_failure}"
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Unable to parse recipe ({parse_failure})",
                    )
            parser_settings = policy.parser_settings or {}
            try:
                min_extraction_confidence = float(parser_settings.get("min_extraction_confidence", 0.35))
            except (TypeError, ValueError):
                min_extraction_confidence = 0.35
            allow_low_confidence = bool(parser_settings.get("allow_low_confidence", False))
            if parsed.extraction_confidence < min_extraction_confidence and not allow_low_confidence:
                recovered = parse_recipe_with_recovery(
                    html,
                    job.source_url,
                    parse_failure="low-confidence-parse",
                    parser_settings=parser_settings,
                )
                if recovered and (recovered.extraction_confidence >= min_extraction_confidence or allow_low_confidence):
                    parsed = recovered
                else:
                    confidence_bucket = _confidence_bucket(parsed.extraction_confidence)
                    job.parse_strategy = f"parse_failed:low-confidence-parse@{confidence_bucket}"
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            "Unable to parse recipe "
                            f"(low-confidence-parse:{parsed.extraction_confidence})"
                        ),
                    )
            confidence_bucket = _confidence_bucket(parsed.extraction_confidence)
            if parsed.parser_used == "dom_fallback":
                fallback_class = parsed.fallback_class or "unclassified"
                job.parse_strategy = f"dom_fallback:{fallback_class}@{confidence_bucket}"
            elif parsed.parser_used == "recovery_dom_fallback":
                fallback_class = parsed.fallback_class or "unclassified"
                job.parse_strategy = f"dom_fallback:{fallback_class}@{confidence_bucket}:recovered"
            elif parsed.parser_used.startswith("recovery_"):
                recovery_base = parsed.parser_used.replace("recovery_", "", 1)
                recovery_class = parsed.fallback_class or "unknown-parse-failure"
                job.parse_strategy = f"recovery:{recovery_class}:{recovery_base}@{confidence_bucket}"
            else:
                job.parse_strategy = f"{parsed.parser_used}@{confidence_bucket}"
            job.compliance_reasons = None
            parsed_payload = RecipeHarvestRequest(
                source_url=job.source_url,
                source_type=job.source_type,
                raw_text="",
                canonical_name=parsed.canonical_name,
                author=job.author or parsed.author,
                rating_value=job.rating_value or parsed.rating_value,
                rating_count=job.rating_count or parsed.rating_count,
                like_count=job.like_count or parsed.like_count,
                share_count=job.share_count or parsed.share_count,
            )
            result = await _perform_harvest_parsed(
                name=parsed.canonical_name,
                ingredients=[IngredientSchema(**ing) for ing in parsed.ingredients],
                instructions=parsed.instructions,
                payload=parsed_payload,
                policy=policy,
                db=db,
                description=parsed.description,
                tags=parsed.tags,
            )
        job.status = "succeeded"
        job.recipe_id = result.recipe_id
        job.duplicate = result.duplicate
        job.quality_score = result.quality_score
        job.next_retry_at = None
    except HTTPException as exc:
        job.status = "failed"
        job.error = exc.detail
        if job.compliance_reasons is None and isinstance(exc.detail, str) and "Compliance check failed:" in exc.detail:
            reasons = exc.detail.split("Compliance check failed:", 1)[1].strip()
            job.compliance_reasons = [part.strip() for part in reasons.split(",") if part.strip()]
        job.next_retry_at = _compute_next_retry(job.attempt_count or 0)
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error = str(exc)
        job.next_retry_at = _compute_next_retry(job.attempt_count or 0)
    await db.commit()
    await db.refresh(job)
    record_harvest_job_metrics(
        source_url=job.source_url,
        status=job.status,
        parse_strategy=job.parse_strategy,
        compliance_reasons=job.compliance_reasons,
        error=str(job.error) if job.error is not None else None,
    )
    return job


@router.post("/embeddings/refresh")
async def refresh_recipe_embeddings(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    result = await db.execute(select(Recipe))
    recipes = list(result.scalars().all())
    count = await rebuild_recipe_embeddings(db, recipes)
    await db.commit()
    model = settings.embeddings_model if settings.embeddings_provider.lower() == "openai" else EMBEDDING_MODEL
    return {"status": "ok", "count": count, "model": model}


@router.get("/{recipe_id}/taste-alikes", response_model=List[RecipeRead])
async def taste_alikes(
    recipe_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
    limit: int = 5,
):
    recipe = await db.get(Recipe, recipe_id, options=[joinedload(Recipe.ingredient_rows)])
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    embedding = await ensure_recipe_embedding(db, recipe)
    await db.commit()
    distance = RecipeEmbedding.embedding.cosine_distance(embedding.embedding)
    model = settings.embeddings_model if settings.embeddings_provider.lower() == "openai" else EMBEDDING_MODEL
    result = await db.execute(
        select(Recipe)
        .options(joinedload(Recipe.ingredient_rows))
        .join(RecipeEmbedding, RecipeEmbedding.recipe_id == Recipe.id)
        .where(Recipe.id != recipe.id)
        .where(RecipeEmbedding.model == model)
        .order_by(distance)
        .limit(limit)
    )
    recipes = list(result.unique().scalars().all())
    overrides = await _load_overrides(db, [recipe.id for recipe in recipes])
    return [_apply_overrides(recipe, overrides.get(str(recipe.id))) for recipe in recipes]
