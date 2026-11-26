"""Matches apps/teachers/serializers.py's TeacherSerializer(UserBackedSerializer)
field set — a Teacher create/update also writes the linked User row (email, name,
password, phone) in the same request, since Teacher has no email/name of its own."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.accounts.schemas import UserOut
from app.core.validators import normalize_mobile


class TeacherCreate(BaseModel):
    email: str
    first_name: str
    last_name: str = ""
    password: str
    phone: str = ""
    employee_id: str = Field(max_length=30)
    qualification: str = Field(default="", max_length=200)
    is_public: bool = True
    joining_date: date | None = None
    is_active: bool = True
    school: uuid.UUID | None = None

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, value):
        return normalize_mobile(value)


class TeacherUpdate(BaseModel):
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    password: str | None = None
    phone: str | None = None
    employee_id: str | None = Field(default=None, max_length=30)
    qualification: str | None = Field(default=None, max_length=200)
    is_public: bool | None = None
    joining_date: date | None = None
    is_active: bool | None = None

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, value):
        return normalize_mobile(value) if value is not None else value


class TeacherOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    school: uuid.UUID = Field(validation_alias="school_id")
    employee_id: str
    phone: str
    qualification: str
    is_public: bool
    joining_date: date | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    user: UserOut


class TeacherRatingSubmissionIn(BaseModel):
    teacher_id: uuid.UUID
    rating: int = Field(ge=1, le=5)
    feedback: str = Field(default="", max_length=2000)
