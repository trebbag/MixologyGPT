import pyotp
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_active_user
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.mfa import MfaSetupResponse, MfaVerifyRequest


router = APIRouter()


@router.post("/setup", response_model=MfaSetupResponse)
async def setup_mfa(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    secret = pyotp.random_base32()
    user.mfa_secret = secret
    db.add(user)
    await db.commit()
    otpauth = pyotp.totp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="BartenderAI")
    return MfaSetupResponse(secret=secret, otpauth_url=otpauth)


@router.post("/enable")
async def enable_mfa(
    payload: MfaVerifyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    if not user.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA not initialized")
    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(payload.token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    user.mfa_enabled = True
    db.add(user)
    await db.commit()
    return {"status": "enabled"}


@router.post("/disable")
async def disable_mfa(
    payload: MfaVerifyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    if not user.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA not initialized")
    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(payload.token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    user.mfa_enabled = False
    db.add(user)
    await db.commit()
    return {"status": "disabled"}
