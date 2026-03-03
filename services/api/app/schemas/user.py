import uuid
from typing import Literal, Optional

from fastapi_users import schemas
from pydantic import BaseModel, EmailStr


class UserRead(schemas.BaseUser[uuid.UUID]):
    role: str


class UserRegister(schemas.BaseUserCreate):
    """Public registration schema.

    Security: do not accept `role` on public registration.
    """


class UserCreate(schemas.BaseUserCreate):
    # Internal/admin user creation schema (not used by the public register router).
    role: Optional[str] = "user"


class UserUpdate(schemas.BaseUserUpdate):
    # Security: role changes are admin-only and handled via /v1/admin/users/{id}.
    pass


class UserRoleBootstrapRequest(BaseModel):
    email: EmailStr
    role: Literal["consumer", "user", "power", "admin"] = "power"
    is_active: bool = True
    is_verified: bool = True
