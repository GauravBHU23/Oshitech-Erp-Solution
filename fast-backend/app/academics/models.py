"""Maps onto Django's existing academics_* tables — column names/types verified
against the live schema (information_schema.columns)."""
import uuid

from sqlalchemy import Boolean, Date, ForeignKey, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import TenantModel


class AcademicYear(Base, TenantModel):
    __tablename__ = "academics_academicyear"

    school_id: Mapped[uuid.UUID] = TenantModel.school_id_column()
    name: Mapped[str] = mapped_column(String(20))
    start_date = mapped_column(Date)
    end_date = mapped_column(Date)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)


class Course(Base, TenantModel):
    __tablename__ = "academics_course"

    school_id: Mapped[uuid.UUID] = TenantModel.school_id_column()
    name: Mapped[str] = mapped_column(String(150))
    code: Mapped[str] = mapped_column(String(20))
    description: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Subject(Base, TenantModel):
    __tablename__ = "academics_subject"

    school_id: Mapped[uuid.UUID] = TenantModel.school_id_column()
    course_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("academics_course.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(150))
    code: Mapped[str] = mapped_column(String(20))


class ClassRoom(Base, TenantModel):
    __tablename__ = "academics_classroom"

    school_id: Mapped[uuid.UUID] = TenantModel.school_id_column()
    course_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("academics_course.id", ondelete="CASCADE"))
    academic_year_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("academics_academicyear.id", ondelete="CASCADE"))
    section: Mapped[str] = mapped_column(String(10), default="")
    capacity: Mapped[int] = mapped_column(SmallInteger, default=40)
    class_teacher_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("teachers_teacher.id", ondelete="SET NULL"), nullable=True)


class TeachingAssignment(Base, TenantModel):
    __tablename__ = "academics_teachingassignment"

    school_id: Mapped[uuid.UUID] = TenantModel.school_id_column()
    classroom_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("academics_classroom.id", ondelete="CASCADE"))
    subject_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("academics_subject.id", ondelete="CASCADE"))
    teacher_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("teachers_teacher.id", ondelete="CASCADE"))
