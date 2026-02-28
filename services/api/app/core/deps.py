import uuid
from fastapi import Depends, HTTPException, status
from fastapi_users import FastAPIUsers

from app.core.security import auth_backend
from app.core.user_manager import get_user_manager
from app.db.models.user import User


fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)
optional_user = fastapi_users.current_user(optional=True)


async def current_active_admin(user: User = Depends(current_active_user)) -> User:
    if user.role != "admin" and not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    return user
