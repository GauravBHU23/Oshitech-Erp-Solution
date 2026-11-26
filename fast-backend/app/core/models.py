"""Maps onto Django's existing core_auditlog, core_supportrequest, and
stre_strecaptcha tables (StreCaptcha lives in the stre_ app in Django but is reused
by main-ERP login too — see backend/apps/accounts/views.py's LoginView, which imports
apps.stre.security as captcha_security). Column names/types verified against the live
schema (psql \\d <table>)."""
import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import INET, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import BaseModel, _utcnow


class AuditLog(Base):
    __tablename__ = "core_auditlog"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    user_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts_user.id"), nullable=True)
    school_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("schools_school.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(50))
    model: Mapped[str] = mapped_column(String(100))
    object_id: Mapped[str] = mapped_column(String(64))
    changes: Mapped[dict] = mapped_column(JSON, default=dict)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)


class SupportRequest(Base, BaseModel):
    __tablename__ = "core_supportrequest"

    reporter_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts_user.id"), nullable=True)
    school_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("schools_school.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(150), default="")
    phone: Mapped[str] = mapped_column(String(20), default="")
    email: Mapped[str] = mapped_column(String(254))
    role: Mapped[str] = mapped_column(String(20), default="")
    category: Mapped[str] = mapped_column(String(20))
    subject: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open")


class StreCaptcha(Base):
    """Shared by both the STRE portal and the main ERP's /auth/login/ — table name
    keeps Django's original app-label prefix since it's the EXISTING shared table."""
    __tablename__ = "stre_strecaptcha"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    answer_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
