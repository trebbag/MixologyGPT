import uuid
from typing import Optional

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, UUIDIDMixin
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase

from app.core.config import settings
from app.db.models.user import User
from app.db.session import get_db


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.jwt_secret
    verification_token_secret = settings.jwt_secret

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        return

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ) -> None:
        # TODO: replace with real email delivery integration
        print(f"[auth] Reset password token for {user.email}: {token}")

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ) -> None:
        # TODO: replace with real email delivery integration
        print(f"[auth] Verify account token for {user.email}: {token}")


async def get_user_db(session=Depends(get_db)):
    yield SQLAlchemyUserDatabase(session, User)


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)
