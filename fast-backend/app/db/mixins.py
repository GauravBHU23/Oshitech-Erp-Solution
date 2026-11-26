"""SQLAlchemy equivalents of backend/apps/core/models.py's BaseModel/TenantModel.

Verified against the live schema (`\\d schools_school`): id/created_at/updated_at have
NO server-side defaults — Django sets them in Python before INSERT (uuid4() / now()).
These mixins do the same at the ORM level so inserts match Django's behavior exactly
rather than relying on Postgres DEFAULT clauses the existing columns don't have.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PGUUID


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class BaseModel:
    """UUID primary key (id-enumeration resistant) + created_at/updated_at timestamps."""

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class TenantModel(BaseModel):
    """Every tenant-scoped model has a school FK — the multi-tenancy backbone.
    Concrete models still declare their own `school_id` column (SQLAlchemy mixins can't
    cleanly share a single ForeignKey column across unrelated tables' different FK names
    the way Django's abstract-model FK can), but every tenant model MUST name it
    `school_id` -> schools_school.id for the shared query-scoping helpers in
    core/deps.py / core/crud_base.py to work generically."""

    @classmethod
    def school_id_column(cls):
        return mapped_column(PGUUID(as_uuid=True), ForeignKey("schools_school.id", ondelete="CASCADE"), nullable=False)
