"""Maps onto Django's existing teachers_* tables — column names/types verified
against the live schema (information_schema.columns)."""
import uuid

from sqlalchemy import Boolean, Date, ForeignKey, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.accounts.models import User
from app.db.base import Base
from app.db.mixins import TenantModel


class Teacher(Base, TenantModel):
    __tablename__ = "teachers_teacher"

    school_id: Mapped[uuid.UUID] = TenantModel.school_id_column()
    user_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts_user.id", ondelete="CASCADE"), unique=True)
    employee_id: Mapped[str] = mapped_column(String(30))
    phone: Mapped[str] = mapped_column(String(15), default="")
    qualification: Mapped[str] = mapped_column(String(200), default="")
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    joining_date = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # lazy="joined" was tried here but silently wraps EVERY query against Teacher
    # (including hand-built aggregate/GROUP BY queries like the public directory's)
    # in an extra auto-join + outer ORDER BY, which Postgres then rejects when the
    # inner query already has its own GROUP BY. Load `.user` explicitly instead —
    # selectinload() where a route needs it, or a plain join when the route is
    # already joining accounts_user itself (the directory/ratings endpoints).
    user: Mapped[User] = relationship(User, lazy="select")


class TeacherRating(Base, TenantModel):
    __tablename__ = "teachers_teacherrating"

    school_id: Mapped[uuid.UUID] = TenantModel.school_id_column()
    teacher_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("teachers_teacher.id", ondelete="CASCADE"))
    student_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("students_student.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(SmallInteger)
    feedback: Mapped[str] = mapped_column(Text, default="")
