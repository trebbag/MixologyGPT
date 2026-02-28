import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from app.schemas.base import BaseSchema


class StudioSessionCreate(BaseModel):
    status: Optional[str] = "active"


class StudioSessionRead(BaseSchema):
    id: uuid.UUID
    user_id: uuid.UUID
    status: str


class StudioVersionCreate(BaseModel):
    version: int
    snapshot: dict[str, Any]


class StudioVersionRead(BaseSchema):
    id: uuid.UUID
    studio_session_id: uuid.UUID
    version: int
    snapshot: dict[str, Any]


class StudioConstraintCreate(BaseModel):
    constraints: dict[str, Any]


class StudioConstraintRead(BaseSchema):
    id: uuid.UUID
    studio_session_id: uuid.UUID
    constraints: dict[str, Any]


class StudioGenerateRequest(BaseModel):
    template: Optional[str] = None
    constraints: Optional[dict[str, Any]] = None


class StudioVersionListRead(BaseSchema):
    id: uuid.UUID
    studio_session_id: uuid.UUID
    version: int
    snapshot: dict[str, Any]


class StudioBalanceResponse(BaseModel):
    metrics: dict[str, float]


class StudioFixRequest(BaseModel):
    feedback: str


class StudioDiffRead(BaseModel):
    from_version_id: uuid.UUID
    to_version_id: uuid.UUID
    diff: dict[str, Any]


class StudioRevertRequest(BaseModel):
    version_id: uuid.UUID


class StudioPromptCreate(BaseModel):
    role: str = "user"
    prompt_type: str = "note"
    content: str


class StudioPromptRead(BaseSchema):
    id: uuid.UUID
    studio_session_id: uuid.UUID
    role: str
    prompt_type: str
    content: str
    created_at: datetime


class StudioCopilotQuestionsResponse(BaseModel):
    questions: list[str]


class StudioCopilotFollowupRequest(BaseModel):
    answer: str


class StudioCopilotFollowupResponse(BaseModel):
    question: str


class StudioAnalyticsResponse(BaseModel):
    total_prompts: int
    total_versions: int
    total_constraints: int
    prompts_by_role: dict[str, int]
    prompts_by_type: dict[str, int]
    last_prompt_at: Optional[datetime] = None


class StudioSessionExportResponse(BaseModel):
    session: StudioSessionRead
    constraints: list[StudioConstraintRead]
    versions: list[StudioVersionRead]
    prompts: list[StudioPromptRead]
    analytics: StudioAnalyticsResponse


class StudioSummaryResponse(BaseModel):
    total_sessions: int
    total_prompts: int
    total_versions: int
    total_constraints: int
    prompts_by_role: dict[str, int]
    prompts_by_type: dict[str, int]
    last_prompt_at: Optional[datetime] = None


class StudioShareCreate(BaseModel):
    version_id: Optional[uuid.UUID] = None


class StudioShareRead(BaseModel):
    slug: str
    payload: dict[str, Any]


class StudioGuidedStep(BaseModel):
    label: str
    seconds: int


class StudioGuidedResponse(BaseModel):
    steps: list[StudioGuidedStep]
