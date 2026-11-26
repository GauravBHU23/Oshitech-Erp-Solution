"""Maps onto Django's existing students_student table — column names/types verified
against the live schema (information_schema.columns).

MINIMAL for now: only the fields academics/teachers/attendance (Phase 2) need for FKs
and filtering (classroom placement, role==student scoping, user linkage). The full
Student model — IDCard, StudentPromotion, StudentImportJob, bulk import — is Phase 3's
job; this file will grow there, not be replaced."""
import uuid

from sqlalchemy import Boolean, Date, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import TenantModel


class Student(Base, TenantModel):
    __tablename__ = "students_student"

    school_id: Mapped[uuid.UUID] = TenantModel.school_id_column()
    user_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts_user.id", ondelete="CASCADE"), unique=True)
    admission_no: Mapped[str] = mapped_column(String(30))
    roll_no: Mapped[str] = mapped_column(String(20), default="")
    class_level: Mapped[str] = mapped_column(String(2), default="")
    classroom_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("academics_classroom.id", ondelete="SET NULL"), nullable=True)
    date_of_birth = mapped_column(Date, nullable=True)
    gender: Mapped[str] = mapped_column(String(1), default="")
    father_name: Mapped[str] = mapped_column(String(150), default="")
    mother_name: Mapped[str] = mapped_column(String(150), default="")
    guardian_phone: Mapped[str] = mapped_column(String(15), default="")
    blood_group: Mapped[str] = mapped_column(String(3), default="")
    address: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
