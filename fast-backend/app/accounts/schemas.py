"""Pydantic schemas matching backend/apps/accounts/serializers.py field names/shapes
exactly, so JSON responses are indistinguishable from the Django backend's."""
import uuid

from pydantic import AliasChoices, BaseModel, EmailStr, Field


class LoginIn(BaseModel):
    email: EmailStr
    password: str
    captcha_id: uuid.UUID
    captcha: str = Field(max_length=10)


class CaptchaOut(BaseModel):
    id: str
    svg: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    role: str
    school: uuid.UUID | None = Field(validation_alias=AliasChoices("school_id", "school"))
    phone: str
    profile_photo: str | None

    model_config = {"from_attributes": True}


class SessionInfoOut(BaseModel):
    idle_minutes: int
    max_hours: int
    expires_at: int | None = None


class LoginOut(BaseModel):
    user: UserOut
    session: SessionInfoOut


class MeOut(UserOut):
    session: SessionInfoOut


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str
