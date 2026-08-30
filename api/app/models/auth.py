from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str | None = Field(default=None, max_length=40)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: EmailStr
    email_verified: bool = True
    verification_sent: bool = False
    verify_url: str | None = None  # when outbound verify mail did not send
    email_configured: bool = False
    first_name: str | None = None
    house: bool = False
    can_view_stats: bool = False


class MeResponse(BaseModel):
    id: int
    email: EmailStr
    pro: bool = False
    plan: str = "free"
    subscription_status: str = "free"
    billing_enabled: bool = False
    email_verified: bool = True
    email_configured: bool = False
    first_name: str | None = None
    house: bool = False
    can_view_stats: bool = False
    created_at: str | None = None
    intro_seen: bool = False
    avatar_url: str | None = None


class UpdateMeRequest(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=40)
    intro_seen: bool | None = None


class OAuthExchangeRequest(BaseModel):
    code: str = Field(min_length=8, max_length=400)


class OAuthProvidersResponse(BaseModel):
    google: bool = False
    apple: bool = False


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    ok: bool = True
    detail: str = "If that email exists, we sent a reset link."
    reset_url: str | None = None  # only when email provider not configured


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class MessageResponse(BaseModel):
    ok: bool = True
    detail: str = ""
    verification_sent: bool = False
    email_configured: bool = False
    verify_url: str | None = None
