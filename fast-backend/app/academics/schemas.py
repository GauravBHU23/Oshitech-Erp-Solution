"""Matches apps/academics/serializers.py's field sets.

Design note: Create/Update schemas accept the SAME field names the frontend sends
("course", "academic_year", "teacher", etc. — these are FK ids, not nested objects,
since DRF's ModelSerializer with fields="__all__" writes PrimaryKeyRelatedField by
that name) via validation_alias, but the schema's own attribute name matches the
SQLAlchemy column (`course_id`) so `model(**body.model_dump())` can construct the ORM
object directly without the factory needing per-model field-name translation.

Every TenantSerializer subclass also adds a `label` field via to_representation()
(str(instance), for frontend dropdowns) — replicated here as a plain field computed
in validate_label, via model_validator, so it serializes in the response like DRF's.
"""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator


class AcademicYearBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str = Field(max_length=20)
    start_date: date
    end_date: date
    is_current: bool = False

    @field_validator("end_date")
    @classmethod
    def _end_after_start(cls, end, info):
        start = info.data.get("start_date")
        if start and end <= start:
            raise ValueError("The end date must be after the start date.")
        return end


class AcademicYearCreate(AcademicYearBase):
    school: uuid.UUID | None = None


class AcademicYearUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=20)
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool | None = None


class AcademicYearOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    school: uuid.UUID = Field(validation_alias="school_id")
    name: str
    start_date: date
    end_date: date
    is_current: bool
    created_at: datetime
    updated_at: datetime

    @computed_field
    def label(self) -> str:
        return self.name


class CourseBase(BaseModel):
    name: str = Field(max_length=150)
    code: str = Field(max_length=20)
    description: str = ""
    is_active: bool = True


class CourseCreate(CourseBase):
    school: uuid.UUID | None = None


class CourseUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=150)
    code: str | None = Field(default=None, max_length=20)
    description: str | None = None
    is_active: bool | None = None


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    school: uuid.UUID = Field(validation_alias="school_id")
    name: str
    code: str
    description: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @computed_field
    def label(self) -> str:
        return self.name


class SubjectCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    course_id: uuid.UUID = Field(validation_alias="course")
    name: str = Field(max_length=150)
    code: str = Field(max_length=20)
    school: uuid.UUID | None = None


class SubjectUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    course_id: uuid.UUID | None = Field(default=None, validation_alias="course")
    name: str | None = Field(default=None, max_length=150)
    code: str | None = Field(default=None, max_length=20)


class SubjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    school: uuid.UUID = Field(validation_alias="school_id")
    course: uuid.UUID = Field(validation_alias="course_id")
    name: str
    code: str
    created_at: datetime
    updated_at: datetime

    @computed_field
    def label(self) -> str:
        return f"{self.name} ({self.code})"


class ClassRoomCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    course_id: uuid.UUID = Field(validation_alias="course")
    academic_year_id: uuid.UUID = Field(validation_alias="academic_year")
    section: str = Field(default="", max_length=10)
    capacity: int = 40
    class_teacher_id: uuid.UUID | None = Field(default=None, validation_alias="class_teacher")
    school: uuid.UUID | None = None


class ClassRoomUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    course_id: uuid.UUID | None = Field(default=None, validation_alias="course")
    academic_year_id: uuid.UUID | None = Field(default=None, validation_alias="academic_year")
    section: str | None = Field(default=None, max_length=10)
    capacity: int | None = None
    class_teacher_id: uuid.UUID | None = Field(default=None, validation_alias="class_teacher")


class ClassRoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    school: uuid.UUID = Field(validation_alias="school_id")
    course: uuid.UUID = Field(validation_alias="course_id")
    academic_year: uuid.UUID = Field(validation_alias="academic_year_id")
    section: str
    capacity: int
    class_teacher: uuid.UUID | None = Field(validation_alias="class_teacher_id")
    created_at: datetime
    updated_at: datetime

    @computed_field
    def label(self) -> str:
        return f"ClassRoom {self.section}".strip()


class TeachingAssignmentCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    classroom_id: uuid.UUID = Field(validation_alias="classroom")
    subject_id: uuid.UUID = Field(validation_alias="subject")
    teacher_id: uuid.UUID = Field(validation_alias="teacher")
    school: uuid.UUID | None = None


class TeachingAssignmentUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    classroom_id: uuid.UUID | None = Field(default=None, validation_alias="classroom")
    subject_id: uuid.UUID | None = Field(default=None, validation_alias="subject")
    teacher_id: uuid.UUID | None = Field(default=None, validation_alias="teacher")


class TeachingAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    school: uuid.UUID = Field(validation_alias="school_id")
    classroom: uuid.UUID = Field(validation_alias="classroom_id")
    subject: uuid.UUID = Field(validation_alias="subject_id")
    teacher: uuid.UUID = Field(validation_alias="teacher_id")
    created_at: datetime
    updated_at: datetime
