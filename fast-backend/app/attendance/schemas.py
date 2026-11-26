"""Matches apps/attendance/serializers.py's AttendanceSerializer/AttendanceMarkSerializer."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    school: uuid.UUID = Field(validation_alias="school_id")
    student: uuid.UUID = Field(validation_alias="student_id")
    classroom: uuid.UUID = Field(validation_alias="classroom_id")
    date: date
    status: str
    remarks: str
    marked_by: uuid.UUID | None = Field(validation_alias="marked_by_id")
    created_at: datetime
    updated_at: datetime
    student_name: str = ""
    admission_no: str = ""
    classroom_name: str = ""


class AttendanceEntry(BaseModel):
    student: uuid.UUID
    status: str = Field(pattern="^(present|absent|late|leave)$")
    remarks: str = Field(default="", max_length=200)


class AttendanceMarkIn(BaseModel):
    classroom: uuid.UUID
    date: date
    entries: list[AttendanceEntry] = Field(min_length=1)


class AttendanceSummaryOut(BaseModel):
    student: str
    student_name: str
    admission_no: str
    roll_no: str
    present: int
    absent: int
    late: int
    leave: int
    total: int
    percentage: float | None
