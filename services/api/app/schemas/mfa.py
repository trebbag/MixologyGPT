from pydantic import BaseModel


class MfaSetupResponse(BaseModel):
    secret: str
    otpauth_url: str


class MfaVerifyRequest(BaseModel):
    token: str
