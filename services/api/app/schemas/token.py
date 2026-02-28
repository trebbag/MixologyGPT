from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DevTokenResponse(BaseModel):
    access_token: str
    token_type: str


class LoginRequest(BaseModel):
    email: str
    password: str
    mfa_token: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=32)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=32)


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class SessionRead(BaseModel):
    id: str
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    created_at: datetime


class MessageResponse(BaseModel):
    status: str
