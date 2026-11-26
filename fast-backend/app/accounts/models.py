"""Maps onto Django's existing accounts_user, accounts_passwordresetotp,
accounts_registrationrequest, token_blacklist_outstandingtoken, and
token_blacklist_blacklistedtoken tables — column names/types verified against the
live schema (psql \\d <table>). fast-backend writes into the SAME blacklist tables
Django/SimpleJWT uses so refresh-token revocation stays mutually visible to both
backends during the coexistence window (see migration plan)."""
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, SmallInteger, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import BaseModel
from app.schools.models import School as _School  # register the FK target in shared metadata


class User(Base):
    __tablename__ = "accounts_user"

    # Django's AbstractUser table uses date_joined, not the shared BaseModel timestamps.
    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    password: Mapped[str] = mapped_column(String(128))
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    first_name: Mapped[str] = mapped_column(String(150))
    last_name: Mapped[str] = mapped_column(String(150))
    is_staff: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    date_joined: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    email: Mapped[str] = mapped_column(String(254), unique=True)
    role: Mapped[str] = mapped_column(String(20))
    phone: Mapped[str] = mapped_column(String(15), default="")
    failed_login_attempts: Mapped[int] = mapped_column(SmallInteger, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    school_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("schools_school.id"), nullable=True)
    profile_photo: Mapped[str] = mapped_column(String(100), default="")


class RegistrationRequest(Base, BaseModel):
    __tablename__ = "accounts_registrationrequest"
    __table_args__ = (UniqueConstraint("email", "status", name="uniq_pending_registration_per_email"),)

    school_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("schools_school.id"))
    role: Mapped[str] = mapped_column(String(20))
    email: Mapped[str] = mapped_column(String(254))
    first_name: Mapped[str] = mapped_column(String(150))
    last_name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[str] = mapped_column(String(15), default="")
    profile_photo: Mapped[str] = mapped_column(String(100), default="")
    password_hash: Mapped[str] = mapped_column(String(128))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts_user.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PasswordResetOtp(Base, BaseModel):
    __tablename__ = "accounts_passwordresetotp"

    user_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts_user.id"))
    code_hash: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(SmallInteger, default=0)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class OutstandingToken(Base):
    """SimpleJWT's own table — fast-backend inserts one row per refresh token it
    issues, exactly like Django does, so both backends' blacklists stay mutually
    visible. `id` is a Postgres identity column (DB-generated), NOT a Python default."""
    __tablename__ = "token_blacklist_outstandingtoken"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    user_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts_user.id"), nullable=True)
    jti: Mapped[str] = mapped_column(String(255), unique=True)


class BlacklistedToken(Base):
    __tablename__ = "token_blacklist_blacklistedtoken"

    id: Mapped[int] = mapped_column(primary_key=True)
    blacklisted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    token_id: Mapped[int] = mapped_column(ForeignKey("token_blacklist_outstandingtoken.id"), unique=True)
