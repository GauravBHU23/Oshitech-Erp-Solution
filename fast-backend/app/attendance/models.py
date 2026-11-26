"""Maps onto Django's existing attendance_attendance table — column names/types
verified against the live schema (information_schema.columns)."""
import uuid

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import TenantModel


class Attendance(Base, TenantModel):
    __tablename__ = "attendance_attendance"

    class Status:
        PRESENT = "present"
        ABSENT = "absent"
        LATE = "late"
        LEAVE = "leave"

    school_id: Mapped[uuid.UUID] = TenantModel.school_id_column()
    student_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("students_student.id", ondelete="CASCADE"))
    classroom_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("academics_classroom.id", ondelete="CASCADE"))
    date = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default=Status.PRESENT)
    remarks: Mapped[str] = mapped_column(String(200), default="")
    marked_by_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts_user.id", ondelete="SET NULL"), nullable=True)
