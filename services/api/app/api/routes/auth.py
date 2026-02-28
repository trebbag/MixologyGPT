import uuid
from typing import Optional

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi_users import FastAPIUsers
from fastapi_users.exceptions import UserNotExists
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import current_active_user
from app.core.security import (
    auth_backend,
    generate_refresh_token,
    hash_refresh_token,
    refresh_expires_at,
    utcnow,
)
from app.core.user_manager import UserManager, get_user_manager
from app.db.models.session import RefreshSession
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.token import (
    DevTokenResponse,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    RefreshRequest,
    SessionRead,
    TokenPairResponse,
)
from app.schemas.user import UserCreate, UserRead, UserRegister, UserUpdate


router = APIRouter()

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

router.include_router(
    fastapi_users.get_register_router(UserRead, UserRegister),
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


def _invalid_credentials() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password",
    )


async def _authenticate_user(
    user_manager: UserManager,
    db: AsyncSession,
    email: str,
    password: str,
) -> User:
    try:
        user = await user_manager.get_by_email(email)
    except UserNotExists as exc:
        # Keep timing behavior consistent when user is unknown.
        user_manager.password_helper.hash(password)
        raise _invalid_credentials() from exc

    verified, updated_password_hash = user_manager.password_helper.verify_and_update(
        password, user.hashed_password
    )
    if not verified:
        raise _invalid_credentials()

    if updated_password_hash is not None:
        user.hashed_password = updated_password_hash
        db.add(user)
        await db.flush()
    return user


def _check_mfa(user: User, mfa_token: Optional[str]) -> None:
    if not user.mfa_enabled:
        return
    if not user.mfa_secret:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="MFA is enabled but not configured",
        )
    if not mfa_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MFA token required",
        )
    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(mfa_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid MFA token",
        )


async def _issue_tokens(
    db: AsyncSession,
    user: User,
    request: Request,
) -> TokenPairResponse:
    strategy = auth_backend.get_strategy()
    access_token = await strategy.write_token(user)
    refresh_token = generate_refresh_token()
    session = RefreshSession(
        user_id=user.id,
        token_hash=hash_refresh_token(refresh_token),
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
        expires_at=refresh_expires_at(),
    )
    db.add(session)
    await db.commit()
    return TokenPairResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.jwt_lifetime_seconds,
    )


@router.post("/auth/jwt/login", response_model=TokenPairResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_manager: UserManager = Depends(get_user_manager),
):
    user = await _authenticate_user(user_manager, db, payload.email, payload.password)
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    _check_mfa(user, payload.mfa_token)
    return await _issue_tokens(db, user, request)


@router.post("/auth/jwt/refresh", response_model=TokenPairResponse)
async def refresh_token(
    payload: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    now = utcnow()
    token_hash = hash_refresh_token(payload.refresh_token)
    result = await db.execute(
        select(RefreshSession).where(RefreshSession.token_hash == token_hash)
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    if session.revoked_at is not None or session.expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired or revoked",
        )

    user = await db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not available",
        )

    # Rotate refresh tokens on every refresh to reduce replay risk.
    new_refresh_token = generate_refresh_token()
    new_session = RefreshSession(
        user_id=user.id,
        token_hash=hash_refresh_token(new_refresh_token),
        user_agent=request.headers.get("user-agent") or session.user_agent,
        ip_address=request.client.host if request.client else session.ip_address,
        expires_at=refresh_expires_at(),
    )
    db.add(new_session)
    await db.flush()

    session.revoked_at = now
    session.last_used_at = now
    session.replaced_by_session_id = new_session.id
    db.add(session)

    strategy = auth_backend.get_strategy()
    access_token = await strategy.write_token(user)
    await db.commit()
    return TokenPairResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=settings.jwt_lifetime_seconds,
    )


@router.post("/auth/jwt/logout", response_model=MessageResponse)
async def logout(
    payload: LogoutRequest,
    db: AsyncSession = Depends(get_db),
):
    now = utcnow()
    token_hash = hash_refresh_token(payload.refresh_token)
    result = await db.execute(
        select(RefreshSession).where(RefreshSession.token_hash == token_hash)
    )
    session = result.scalars().first()
    if session and session.revoked_at is None:
        session.revoked_at = now
        session.last_used_at = now
        db.add(session)
        await db.commit()
    return MessageResponse(status="ok")


@router.get("/auth/sessions", response_model=list[SessionRead])
async def list_auth_sessions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(RefreshSession)
        .where(RefreshSession.user_id == user.id)
        .order_by(RefreshSession.created_at.desc())
    )
    sessions = list(result.scalars().all())
    return [
        SessionRead(
            id=str(session.id),
            user_agent=session.user_agent,
            ip_address=session.ip_address,
            expires_at=session.expires_at,
            revoked_at=session.revoked_at,
            last_used_at=session.last_used_at,
            created_at=session.created_at,
        )
        for session in sessions
    ]


@router.delete("/auth/sessions/{session_id}", response_model=MessageResponse)
async def revoke_auth_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    session = await db.get(RefreshSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
    if session.revoked_at is None:
        session.revoked_at = utcnow()
        session.last_used_at = session.revoked_at
        db.add(session)
        await db.commit()
    return MessageResponse(status="ok")


@router.post("/auth/dev-token", response_model=DevTokenResponse)
async def dev_token(unique: bool = False, user_manager: UserManager = Depends(get_user_manager)):
    if settings.environment != "local":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    password = "dev-password"
    if unique:
        email = f"dev+{uuid.uuid4().hex[:12]}@bartender.ai"
        existing = await user_manager.create(
            UserCreate(email=email, password=password, role="admin"),
            safe=False,
        )
    else:
        email = "dev@bartender.ai"
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
