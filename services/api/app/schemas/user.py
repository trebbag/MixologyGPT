import uuid
from typing import Optional

from fastapi_users import schemas


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
