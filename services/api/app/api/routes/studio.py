import re
import uuid
from typing import List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_active_user
from app.core.rate_limit import limiter
from app.db.models.ingredient import Ingredient, IngredientAlias
from app.db.session import get_db
from app.db.models.studio import StudioSession, StudioVersion, StudioConstraint, StudioDiff, StudioPrompt, StudioShare
from app.domain.balance import compute_metrics, apply_fix, suggest_fixes
from app.domain.studio_generator import build_recipe
from app.domain.studio_diff import diff_snapshots
from app.domain.llm import generate_json
from app.schemas.studio import (
    StudioSessionCreate,
    StudioSessionRead,
    StudioVersionCreate,
    StudioVersionRead,
    StudioConstraintCreate,
    StudioConstraintRead,
    StudioGenerateRequest,
    StudioVersionListRead,
    StudioFixRequest,
    StudioBalanceResponse,
    StudioDiffRead,
    StudioRevertRequest,
    StudioPromptCreate,
    StudioPromptRead,
    StudioCopilotQuestionsResponse,
    StudioCopilotFollowupRequest,
    StudioCopilotFollowupResponse,
    StudioAnalyticsResponse,
    StudioSessionExportResponse,
    StudioSummaryResponse,
    StudioShareCreate,
    StudioShareRead,
    StudioGuidedResponse,
    StudioGuidedStep,
)
from app.db.models.user import User


router = APIRouter()


async def _get_latest_version(db: AsyncSession, session_id: str) -> Optional[StudioVersion]:
    result = await db.execute(
        select(StudioVersion)
        .where(StudioVersion.studio_session_id == session_id)
        .order_by(StudioVersion.version.desc())
        .limit(1)
    )
    return result.scalars().first()


async def _compute_analytics(db: AsyncSession, session_id: str) -> StudioAnalyticsResponse:
    prompts_result = await db.execute(
        select(StudioPrompt).where(StudioPrompt.studio_session_id == session_id)
    )
    prompts = list(prompts_result.scalars().all())
    prompts_by_role: dict[str, int] = {}
    prompts_by_type: dict[str, int] = {}
    last_prompt_at = None
    for prompt in prompts:
        prompts_by_role[prompt.role] = prompts_by_role.get(prompt.role, 0) + 1
        prompts_by_type[prompt.prompt_type] = prompts_by_type.get(prompt.prompt_type, 0) + 1
        if not last_prompt_at or prompt.created_at > last_prompt_at:
            last_prompt_at = prompt.created_at

    versions_result = await db.execute(
        select(StudioVersion).where(StudioVersion.studio_session_id == session_id)
    )
    constraints_result = await db.execute(
        select(StudioConstraint).where(StudioConstraint.studio_session_id == session_id)
    )
    total_versions = len(list(versions_result.scalars().all()))
    total_constraints = len(list(constraints_result.scalars().all()))
    return StudioAnalyticsResponse(
        total_prompts=len(prompts),
        total_versions=total_versions,
        total_constraints=total_constraints,
        prompts_by_role=prompts_by_role,
        prompts_by_type=prompts_by_type,
        last_prompt_at=last_prompt_at,
    )


def _heuristic_constraints_from_answer(answer: str) -> dict:
    constraints: dict[str, Union[float, str]] = {}
    lower = answer.lower()

    for style in ["sour", "collins", "old fashioned", "negroni"]:
        if style in lower:
            constraints["style"] = style
            break

    abv_match = re.search(r"(\d+(?:\.\d+)?)\s*%?\s*abv", lower)
    if not abv_match:
        abv_match = re.search(r"(\d+(?:\.\d+)?)\s*%", lower)
    if abv_match:
        constraints["abv_target"] = float(abv_match.group(1))

    numeric_fields = {
        "sweetness": "sweetness_target",
        "sweet": "sweetness_target",
        "acidity": "acidity_target",
        "acid": "acidity_target",
        "bitterness": "bitterness_target",
        "bitter": "bitterness_target",
    }
    for key, target in numeric_fields.items():
        match = re.search(rf"{key}\s*(?:is|:)?\s*(\d+(?:\.\d+)?)", lower)
        if match:
            constraints[target] = float(match.group(1))

    def _scale_level(keyword: str, target: str) -> None:
        if target in constraints:
            return
        if keyword in lower:
            if any(token in lower for token in ["low", "less", "light", "mild", "not too"]):
                constraints[target] = 3.0
            elif any(token in lower for token in ["medium", "balanced", "moderate"]):
                constraints[target] = 5.0
            elif any(token in lower for token in ["high", "very", "strong", "bold", "intense"]):
                constraints[target] = 8.0

    _scale_level("sweet", "sweetness_target")
    _scale_level("sour", "acidity_target")
    _scale_level("acid", "acidity_target")
    _scale_level("bitter", "bitterness_target")
    return constraints


def _build_guided_steps(recipe: dict) -> list[StudioGuidedStep]:
    steps: list[StudioGuidedStep] = []
    glassware = recipe.get("glassware")
    ice_style = recipe.get("ice_style")
    if glassware:
        steps.append(StudioGuidedStep(label=f"Prepare {glassware} glass", seconds=10))
    if ice_style and ice_style != "none":
        steps.append(StudioGuidedStep(label=f"Add ice ({ice_style})", seconds=10))

    for instruction in recipe.get("instructions", []):
        text = str(instruction)
        lower = text.lower()
        duration = 20
        match = re.search(r"(\\d+)", lower)
        if match:
            duration = int(match.group(1))
        if "shake" in lower and duration < 8:
            duration = 12
        if "stir" in lower and duration < 10:
            duration = 25
        steps.append(StudioGuidedStep(label=text, seconds=duration))
    return steps


def _contains_phrase(text: str, phrase: str) -> bool:
    if not phrase:
        return False
    if " " in phrase:
        return phrase in text
    return re.search(rf"\\b{re.escape(phrase)}\\b", text) is not None


async def _extract_ingredients_from_answer(db: AsyncSession, answer: str) -> list[str]:
    lower = answer.lower()
    matched: list[str] = []
    result = await db.execute(select(Ingredient.canonical_name))
    canonical_names = [row[0] for row in result.all()]
    for name in canonical_names:
        if _contains_phrase(lower, name.lower()):
            matched.append(name)
    alias_result = await db.execute(
        select(IngredientAlias.alias, Ingredient.canonical_name).join(
            Ingredient, IngredientAlias.ingredient_id == Ingredient.id
        )
    )
    for alias, canonical in alias_result.all():
        if _contains_phrase(lower, alias.lower()):
            matched.append(canonical)
    # de-dupe while preserving order
    seen = set()
    output = []
    for item in matched:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output


async def _infer_constraints_from_answer(db: AsyncSession, answer: str, constraints: dict) -> dict:
    llm_payload = await generate_json(
        "You are a mixology copilot. Extract constraints as JSON only.",
        f"Existing constraints: {constraints}\nAnswer: {answer}\nReturn any of: style, abv_target, sweetness_target, acidity_target, bitterness_target.",
        {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "style": {"type": "string"},
                "abv_target": {"type": "number"},
                "sweetness_target": {"type": "number"},
                "acidity_target": {"type": "number"},
                "bitterness_target": {"type": "number"},
            },
        },
    )
    inferred = {k: v for k, v in llm_payload.items() if v is not None} if llm_payload else {}
    if not inferred:
        inferred = _heuristic_constraints_from_answer(answer)
    ingredients = await _extract_ingredients_from_answer(db, answer)
    if ingredients:
        existing = constraints.get("include_ingredients") or []
        combined = list(existing)
        for ing in ingredients:
            if not any(ing.lower() == existing_ing.lower() for existing_ing in combined):
                combined.append(ing)
        inferred["include_ingredients"] = combined
    return inferred


@router.post("/sessions", response_model=StudioSessionRead)
async def create_session(
    payload: StudioSessionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = StudioSession(user_id=user.id, status=payload.status or "active")
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/sessions", response_model=List[StudioSessionRead])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(select(StudioSession).where(StudioSession.user_id == user.id))
    return list(result.scalars().all())


@router.post("/sessions/{session_id}/versions", response_model=StudioVersionRead)
async def create_version(
    session_id: str,
    payload: StudioVersionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    version = StudioVersion(
        studio_session_id=session_id,
        version=payload.version,
        snapshot=payload.snapshot,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return version


@router.get("/sessions/{session_id}/versions", response_model=List[StudioVersionListRead])
async def list_versions(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    result = await db.execute(
        select(StudioVersion).where(StudioVersion.studio_session_id == session_id).order_by(StudioVersion.version)
    )
    return list(result.scalars().all())


@router.post("/sessions/{session_id}/constraints", response_model=StudioConstraintRead)
async def create_constraint(
    session_id: str,
    payload: StudioConstraintCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    constraint = StudioConstraint(studio_session_id=session_id, constraints=payload.constraints)
    db.add(constraint)
    await db.commit()
    await db.refresh(constraint)
    return constraint


@router.get("/sessions/{session_id}/constraints", response_model=List[StudioConstraintRead])
async def list_constraints(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    result = await db.execute(select(StudioConstraint).where(StudioConstraint.studio_session_id == session_id))
    return list(result.scalars().all())


@router.post("/sessions/{session_id}/generate", response_model=StudioVersionRead)
async def generate_version(
    session_id: str,
    payload: StudioGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    constraints = payload.constraints or {}
    if not constraints:
        latest = await db.execute(
            select(StudioConstraint)
            .where(StudioConstraint.studio_session_id == session_id)
            .order_by(StudioConstraint.created_at.desc())
        )
        last_constraint = latest.scalars().first()
        if last_constraint:
            constraints = last_constraint.constraints

    template = (payload.template or constraints.get("style") or "sour").lower()
    recipe = build_recipe(template, constraints)

    max_version_result = await db.execute(
        select(func.max(StudioVersion.version)).where(StudioVersion.studio_session_id == session_id)
    )
    current_max = max_version_result.scalar() or 0
    version_number = current_max + 1

    snapshot = {
        "version": version_number,
        "recipe": recipe,
        "metrics": {
            "abv_estimate": 0.0,
            "sweetness_index": 0.0,
            "acidity_index": 0.0,
            "bitterness_index": 0.0,
        },
    }
    version = StudioVersion(
        studio_session_id=session_id,
        version=version_number,
        snapshot=snapshot,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return version


@router.get("/sessions/{session_id}/balance", response_model=StudioBalanceResponse)
async def balance_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    latest = await _get_latest_version(db, session_id)
    if not latest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No versions")
    recipe = latest.snapshot.get("recipe", {})
    metrics = compute_metrics(recipe.get("ingredients", []))
    latest.snapshot["metrics"] = metrics
    await db.commit()
    return StudioBalanceResponse(metrics=metrics)


@router.post("/sessions/{session_id}/fix", response_model=StudioVersionRead)
async def fix_session(
    session_id: str,
    payload: StudioFixRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    latest = await _get_latest_version(db, session_id)
    if not latest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No versions")
    recipe = latest.snapshot.get("recipe", {})
    ingredients = recipe.get("ingredients", [])
    new_ingredients = apply_fix(ingredients, payload.feedback)
    suggestions = suggest_fixes(compute_metrics(ingredients), payload.feedback)

    max_version_result = await db.execute(
        select(func.max(StudioVersion.version)).where(StudioVersion.studio_session_id == session_id)
    )
    current_max = max_version_result.scalar() or 0
    version_number = current_max + 1

    snapshot = {
        "version": version_number,
        "recipe": {
            **recipe,
            "ingredients": new_ingredients,
        },
        "metrics": compute_metrics(new_ingredients),
        "fix_suggestions": suggestions,
    }
    version = StudioVersion(
        studio_session_id=session_id,
        version=version_number,
        snapshot=snapshot,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return version


@router.get("/sessions/{session_id}/diff", response_model=StudioDiffRead)
async def diff_versions(
    session_id: str,
    from_version_id: str,
    to_version_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    from_version = await db.get(StudioVersion, from_version_id)
    to_version = await db.get(StudioVersion, to_version_id)
    if not from_version or not to_version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    if from_version.studio_session_id != session.id or to_version.studio_session_id != session.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Version mismatch")
    diff = diff_snapshots(from_version.snapshot, to_version.snapshot)
    record = StudioDiff(studio_version_id=to_version.id, diff={"from": from_version.id, "diff": diff})
    db.add(record)
    await db.commit()
    return StudioDiffRead(from_version_id=from_version.id, to_version_id=to_version.id, diff=diff)


@router.post("/sessions/{session_id}/revert", response_model=StudioVersionRead)
async def revert_version(
    session_id: str,
    payload: StudioRevertRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    version = await db.get(StudioVersion, payload.version_id)
    if not version or version.studio_session_id != session.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    max_version_result = await db.execute(
        select(func.max(StudioVersion.version)).where(StudioVersion.studio_session_id == session_id)
    )
    current_max = max_version_result.scalar() or 0
    version_number = current_max + 1
    snapshot = dict(version.snapshot)
    snapshot["version"] = version_number
    snapshot["reverted_from"] = str(version.id)
    new_version = StudioVersion(
        studio_session_id=session_id,
        version=version_number,
        snapshot=snapshot,
    )
    db.add(new_version)
    await db.commit()
    await db.refresh(new_version)
    return new_version


@router.get("/sessions/{session_id}/prompts", response_model=List[StudioPromptRead])
async def list_prompts(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    result = await db.execute(
        select(StudioPrompt).where(StudioPrompt.studio_session_id == session_id).order_by(StudioPrompt.created_at)
    )
    return list(result.scalars().all())


@router.post("/sessions/{session_id}/prompts", response_model=StudioPromptRead)
async def create_prompt(
    session_id: str,
    payload: StudioPromptCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    prompt = StudioPrompt(
        studio_session_id=session_id,
        role=payload.role,
        prompt_type=payload.prompt_type,
        content=payload.content,
    )
    db.add(prompt)
    await db.commit()
    await db.refresh(prompt)
    return prompt


@router.post("/sessions/{session_id}/copilot/questions", response_model=StudioCopilotQuestionsResponse)
@limiter.limit("20/minute")
async def copilot_questions(
    session_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    constraints_result = await db.execute(
        select(StudioConstraint)
        .where(StudioConstraint.studio_session_id == session_id)
        .order_by(StudioConstraint.created_at.desc())
        .limit(1)
    )
    latest_constraint = constraints_result.scalars().first()
    constraints = latest_constraint.constraints if latest_constraint else {}
    missing_questions = []
    if not constraints.get("include_ingredients"):
        missing_questions.append("Any must-use base spirit or ingredient?")
    if not constraints.get("style"):
        missing_questions.append("What style are you aiming for (sour, collins, old fashioned, negroni)?")
    if constraints.get("abv_target") is None:
        missing_questions.append("Target ABV or strength preference?")
    if constraints.get("sweetness_target") is None:
        missing_questions.append("Sweetness level (0-10)?")
    if constraints.get("acidity_target") is None:
        missing_questions.append("Acidity level (0-10)?")
    if constraints.get("bitterness_target") is None:
        missing_questions.append("Bitterness level (0-10)?")

    llm_questions = await generate_json(
        "You are a mixology copilot. Return JSON only.",
        f"Constraints: {constraints}\nReturn a JSON object with a questions array of short strings.",
        {
            "type": "object",
            "additionalProperties": False,
            "required": ["questions"],
            "properties": {"questions": {"type": "array", "items": {"type": "string"}}},
        },
    )
    questions = llm_questions.get("questions") if llm_questions else None
    if not questions:
        questions = missing_questions[:4] if missing_questions else ["Any specific flavor direction?"]

    for question in questions:
        db.add(
            StudioPrompt(
                studio_session_id=session_id,
                role="assistant",
                prompt_type="question",
                content=question,
            )
        )
    await db.commit()
    return StudioCopilotQuestionsResponse(questions=questions)


@router.post("/sessions/{session_id}/copilot/follow-up", response_model=StudioCopilotFollowupResponse)
@limiter.limit("30/minute")
async def copilot_followup(
    session_id: str,
    payload: StudioCopilotFollowupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    answer = payload.answer.strip()
    if not answer:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Answer required")

    db.add(
        StudioPrompt(
            studio_session_id=session_id,
            role="user",
            prompt_type="answer",
            content=answer,
        )
    )

    constraints_result = await db.execute(
        select(StudioConstraint)
        .where(StudioConstraint.studio_session_id == session_id)
        .order_by(StudioConstraint.created_at.desc())
        .limit(1)
    )
    latest_constraint = constraints_result.scalars().first()
    current_constraints = latest_constraint.constraints if latest_constraint else {}
    inferred = await _infer_constraints_from_answer(db, answer, current_constraints)
    if inferred:
        merged = {**current_constraints, **inferred}
        db.add(StudioConstraint(studio_session_id=session_id, constraints=merged))

    prompt_result = await db.execute(
        select(StudioPrompt)
        .where(StudioPrompt.studio_session_id == session_id)
        .order_by(StudioPrompt.created_at.desc())
        .limit(6)
    )
    history = list(reversed([p.content for p in prompt_result.scalars().all()]))
    llm_payload = await generate_json(
        "You are a mixology copilot. Return JSON only.",
        f"Conversation so far: {history}\nLatest answer: {answer}\nReturn a short follow-up question.",
        {
            "type": "object",
            "additionalProperties": False,
            "required": ["question"],
            "properties": {"question": {"type": "string"}},
        },
    )
    question = None
    if llm_payload:
        question = llm_payload.get("question")

    if not question:
        lower = answer.lower()
        if "sweet" in lower:
            question = "Want more acidity to balance the sweetness?"
        elif "sour" in lower or "acid" in lower:
            question = "Should we soften the acidity with a touch of sweetness?"
        elif "strong" in lower:
            question = "Prefer lowering ABV with a lighter base or adding dilution?"
        else:
            question = "Any garnish or texture preference?"

    db.add(
        StudioPrompt(
            studio_session_id=session_id,
            role="assistant",
            prompt_type="question",
            content=question,
        )
    )
    await db.commit()
    return StudioCopilotFollowupResponse(question=question)


@router.get("/sessions/{session_id}/analytics", response_model=StudioAnalyticsResponse)
async def session_analytics(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return await _compute_analytics(db, session_id)


@router.get("/analytics/summary", response_model=StudioSummaryResponse)
async def studio_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    total_sessions = await db.scalar(
        select(func.count()).select_from(StudioSession).where(StudioSession.user_id == user.id)
    )
    if not total_sessions:
        return StudioSummaryResponse(
            total_sessions=0,
            total_prompts=0,
            total_versions=0,
            total_constraints=0,
            prompts_by_role={},
            prompts_by_type={},
            last_prompt_at=None,
        )

    role_result = await db.execute(
        select(StudioPrompt.role, func.count())
        .join(StudioSession, StudioPrompt.studio_session_id == StudioSession.id)
        .where(StudioSession.user_id == user.id)
        .group_by(StudioPrompt.role)
    )
    prompts_by_role: dict[str, int] = {str(role): int(count) for role, count in role_result.all()}

    type_result = await db.execute(
        select(StudioPrompt.prompt_type, func.count())
        .join(StudioSession, StudioPrompt.studio_session_id == StudioSession.id)
        .where(StudioSession.user_id == user.id)
        .group_by(StudioPrompt.prompt_type)
    )
    prompts_by_type: dict[str, int] = {
        str(prompt_type): int(count) for prompt_type, count in type_result.all()
    }

    total_prompts = await db.scalar(
        select(func.count())
        .select_from(StudioPrompt)
        .join(StudioSession, StudioPrompt.studio_session_id == StudioSession.id)
        .where(StudioSession.user_id == user.id)
    )
    last_prompt_at = await db.scalar(
        select(func.max(StudioPrompt.created_at))
        .select_from(StudioPrompt)
        .join(StudioSession, StudioPrompt.studio_session_id == StudioSession.id)
        .where(StudioSession.user_id == user.id)
    )
    total_versions = await db.scalar(
        select(func.count())
        .select_from(StudioVersion)
        .join(StudioSession, StudioVersion.studio_session_id == StudioSession.id)
        .where(StudioSession.user_id == user.id)
    )
    total_constraints = await db.scalar(
        select(func.count())
        .select_from(StudioConstraint)
        .join(StudioSession, StudioConstraint.studio_session_id == StudioSession.id)
        .where(StudioSession.user_id == user.id)
    )

    return StudioSummaryResponse(
        total_sessions=int(total_sessions or 0),
        total_prompts=int(total_prompts or 0),
        total_versions=int(total_versions or 0),
        total_constraints=int(total_constraints or 0),
        prompts_by_role=prompts_by_role,
        prompts_by_type=prompts_by_type,
        last_prompt_at=last_prompt_at,
    )


@router.get("/sessions/{session_id}/export", response_model=StudioSessionExportResponse)
async def export_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    constraints_result = await db.execute(
        select(StudioConstraint).where(StudioConstraint.studio_session_id == session_id).order_by(StudioConstraint.created_at)
    )
    versions_result = await db.execute(
        select(StudioVersion).where(StudioVersion.studio_session_id == session_id).order_by(StudioVersion.version)
    )
    prompts_result = await db.execute(
        select(StudioPrompt).where(StudioPrompt.studio_session_id == session_id).order_by(StudioPrompt.created_at)
    )
    analytics = await _compute_analytics(db, session_id)
    return StudioSessionExportResponse(
        session=StudioSessionRead.model_validate(session),
        constraints=list(constraints_result.scalars().all()),
        versions=list(versions_result.scalars().all()),
        prompts=list(prompts_result.scalars().all()),
        analytics=analytics,
    )


@router.post("/sessions/{session_id}/share", response_model=StudioShareRead)
async def create_share(
    session_id: str,
    payload: StudioShareCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    version = None
    if payload.version_id:
        version = await db.get(StudioVersion, payload.version_id)
    if not version:
        version = await _get_latest_version(db, session_id)
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No versions to share")
    slug = uuid.uuid4().hex[:10]
    share = StudioShare(
        studio_session_id=session_id,
        slug=slug,
        payload=version.snapshot,
    )
    db.add(share)
    await db.commit()
    return StudioShareRead(slug=slug, payload=version.snapshot)


@router.get("/share/{slug}", response_model=StudioShareRead)
async def get_share(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StudioShare).where(StudioShare.slug == slug))
    share = result.scalars().first()
    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found")
    return StudioShareRead(slug=share.slug, payload=share.payload)


@router.get("/sessions/{session_id}/guided-making", response_model=StudioGuidedResponse)
async def guided_making(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(StudioSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    latest = await _get_latest_version(db, session_id)
    if not latest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No versions")
    recipe = latest.snapshot.get("recipe", {})
    steps = _build_guided_steps(recipe)
    return StudioGuidedResponse(steps=steps)
