import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_users import FastAPIUsers
from fastapi_users.exceptions import UserNotExists

from app.core.config import settings
from app.core.security import auth_backend
from app.core.user_manager import get_user_manager
from app.db.models.user import User
from app.schemas.token import DevTokenResponse
from app.schemas.user import UserCreate, UserRead, UserUpdate


router = APIRouter()

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

router.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/auth/jwt",
)
router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
)
router.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
)
router.include_router(
    fastapi_users.get_reset_password_router(),
    prefix="/auth",
)
router.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix="/auth",
)


@router.post("/auth/dev-token", response_model=DevTokenResponse)
async def dev_token(user_manager=Depends(get_user_manager)):
    if settings.environment != "local":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    email = "dev@bartender.ai"
    password = "dev-password"
    try:
        existing = await user_manager.get_by_email(email)
    except UserNotExists:
        existing = await user_manager.create(
            UserCreate(email=email, password=password, role="admin"),
            safe=False,
        )
    strategy = auth_backend.get_strategy()
    token = await strategy.write_token(existing)
    return DevTokenResponse(access_token=token, token_type="bearer")
