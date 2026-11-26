"""Port of apps/attendance/views.py's AttendanceViewSet. Built mostly by hand (not
tenant_router()) because: create() is disabled (attendance is written only through
the bulk `mark` action), list is scoped by student/teacher role plus date-range query
params, and destroy has an extra role restriction beyond write_roles."""
import uuid
from collections import defaultdict
from datetime import date as date_type

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.academics.models import ClassRoom, TeachingAssignment
from app.accounts.models import User
from app.attendance.models import Attendance
from app.attendance.schemas import AttendanceMarkIn, AttendanceOut, AttendanceSummaryOut
from app.core.audit import log_action
from app.core.crud_base import check_roles
from app.core.deps import AuthenticatedUser, get_current_user, get_db_session
from app.core.errors import ApiError
from app.core.pagination import Page, PageParams, paginate
from app.core.roles import ADMIN_ONLY, Role
from app.students.models import Student
from app.teachers.models import Teacher

router = APIRouter(prefix="/attendance", tags=["attendance"])

READ_ROLES = [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT]
MARK_ROLES = [Role.SCHOOL_ADMIN, Role.TEACHER]


async def _teacher_classroom_ids(db: AsyncSession, user: User) -> list[uuid.UUID]:
    teacher = (await db.execute(select(Teacher).where(Teacher.user_id == user.id))).scalar_one_or_none()
    if teacher is None:
        return []
    class_teacher_of = (await db.execute(select(ClassRoom.id).where(ClassRoom.class_teacher_id == teacher.id))).scalars().all()
    assigned = (await db.execute(select(TeachingAssignment.classroom_id).where(TeachingAssignment.teacher_id == teacher.id))).scalars().all()
    return list(set(class_teacher_of) | set(assigned))


async def _base_stmt(current: AuthenticatedUser, db: AsyncSession):
    stmt = select(Attendance)
    if current.user.role != Role.SUPER_ADMIN.value:
        if not current.user.school_id:
            return stmt.where(False)
        stmt = stmt.where(Attendance.school_id == current.user.school_id)
    if current.user.role == Role.STUDENT.value:
        student = (await db.execute(select(Student).where(Student.user_id == current.user.id))).scalar_one_or_none()
        if student is None:
            return stmt.where(False)
        stmt = stmt.where(Attendance.student_id == student.id)
    elif current.user.role == Role.TEACHER.value:
        classroom_ids = await _teacher_classroom_ids(db, current.user)
        stmt = stmt.where(Attendance.classroom_id.in_(classroom_ids)) if classroom_ids else stmt.where(False)
    return stmt


async def _classroom_for(db: AsyncSession, current: AuthenticatedUser, classroom_id: uuid.UUID) -> ClassRoom:
    stmt = select(ClassRoom).where(ClassRoom.id == classroom_id)
    if current.user.role != Role.SUPER_ADMIN.value:
        stmt = stmt.where(ClassRoom.school_id == current.user.school_id)
    if current.user.role == Role.TEACHER.value:
        classroom_ids = await _teacher_classroom_ids(db, current.user)
        stmt = stmt.where(ClassRoom.id.in_(classroom_ids)) if classroom_ids else stmt.where(False)
    classroom = (await db.execute(stmt)).scalar_one_or_none()
    if classroom is None:
        raise ApiError(404, "Not found.")
    return classroom


async def _enrich(db: AsyncSession, row: Attendance) -> AttendanceOut:
    """Returns a validated AttendanceOut instance (not a re-dumped dict) — dumping
    with model_dump() and handing that dict back to a response_model re-validates it
    against the schema's validation_alias names (school_id -> school etc.), but
    model_dump() already renamed those keys, so the second pass fails with "field
    required". An already-built model instance skips that second validation."""
    student = (await db.execute(select(Student).where(Student.id == row.student_id))).scalar_one()
    student_user = (await db.execute(select(User).where(User.id == student.user_id))).scalar_one()
    classroom = (await db.execute(select(ClassRoom).where(ClassRoom.id == row.classroom_id))).scalar_one()
    out = AttendanceOut.model_validate(row)
    out.student_name = f"{student_user.first_name} {student_user.last_name}".strip()
    out.admission_no = student.admission_no
    out.classroom_name = f"ClassRoom {classroom.section}".strip()
    return out


@router.get("/", response_model=Page[AttendanceOut])
async def list_attendance(
    request: Request,
    params: PageParams = Depends(),
    classroom: uuid.UUID | None = None,
    student: uuid.UUID | None = None,
    date: date_type | None = None,
    status: str | None = None,
    from_: date_type | None = Query(None, alias="from"),
    to: date_type | None = None,
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    check_roles(current, READ_ROLES)
    stmt = await _base_stmt(current, db)
    if classroom:
        stmt = stmt.where(Attendance.classroom_id == classroom)
    if student:
        stmt = stmt.where(Attendance.student_id == student)
    if date:
        stmt = stmt.where(Attendance.date == date)
    if status:
        stmt = stmt.where(Attendance.status == status)
    if from_:
        stmt = stmt.where(Attendance.date >= from_)
    if to:
        stmt = stmt.where(Attendance.date <= to)
    stmt = stmt.order_by(Attendance.date.desc())
    page = await paginate(db, stmt, params, request)
    page["results"] = [await _enrich(db, row) for row in page["results"]]
    return page


@router.post("/mark/")
async def mark_attendance(
    request: Request,
    body: AttendanceMarkIn,
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    check_roles(current, MARK_ROLES)
    import datetime as _dt
    if body.date > _dt.date.today():
        raise ApiError(400, {"date": ["Attendance cannot be marked for a future date."]})

    classroom = await _classroom_for(db, current, body.classroom)
    student_ids = [e.student for e in body.entries]
    students = {
        s.id: s for s in (await db.execute(
            select(Student).where(Student.classroom_id == classroom.id, Student.id.in_(student_ids))
        )).scalars().all()
    }
    invalid = [str(sid) for sid in student_ids if sid not in students]
    if invalid:
        raise ApiError(400, {"entries": ["Some students are not placed in this classroom."]})

    saved = 0
    for entry in body.entries:
        existing = (await db.execute(
            select(Attendance).where(Attendance.student_id == entry.student, Attendance.date == body.date)
        )).scalar_one_or_none()
        if existing is None:
            existing = Attendance(student_id=entry.student, date=body.date, school_id=classroom.school_id)
            db.add(existing)
        existing.classroom_id = classroom.id
        existing.status = entry.status
        existing.remarks = entry.remarks
        existing.marked_by_id = current.user.id
        saved += 1
    await db.flush()
    await log_action(
        db, request, "attendance_marked", user_id=current.user.id, model_name="ClassRoom", object_id=classroom.id,
        school_id=classroom.school_id, changes={"date": body.date.isoformat(), "count": saved},
    )
    return {"saved": saved, "detail": f"Attendance saved for {saved} students."}


@router.get("/summary/", response_model=list[AttendanceSummaryOut])
async def attendance_summary(
    classroom: uuid.UUID | None = None,
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    check_roles(current, READ_ROLES)
    stmt = await _base_stmt(current, db)
    if current.user.role != Role.STUDENT.value:
        if not classroom:
            raise ApiError(400, {"classroom": ["Select a classroom."]})
        classroom_obj = await _classroom_for(db, current, classroom)
        stmt = stmt.where(Attendance.classroom_id == classroom_obj.id)
        students = (await db.execute(select(Student).where(Student.classroom_id == classroom_obj.id))).scalars().all()
    else:
        student = (await db.execute(select(Student).where(Student.user_id == current.user.id))).scalar_one_or_none()
        students = [student] if student else []

    rows = (await db.execute(stmt)).scalars().all()
    counts: dict[uuid.UUID, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in rows:
        counts[row.student_id][row.status] += 1

    results = []
    for student in students:
        c = counts.get(student.id, {})
        total = sum(c.values())
        attended = c.get("present", 0) + c.get("late", 0)
        user = (await db.execute(select(User).where(User.id == student.user_id))).scalar_one()
        results.append({
            "student": str(student.id),
            "student_name": f"{user.first_name} {user.last_name}".strip(),
            "admission_no": student.admission_no,
            "roll_no": student.roll_no,
            "present": c.get("present", 0),
            "absent": c.get("absent", 0),
            "late": c.get("late", 0),
            "leave": c.get("leave", 0),
            "total": total,
            "percentage": round(attended * 100 / total, 1) if total else None,
        })
    return results


@router.get("/{attendance_id}/", response_model=AttendanceOut)
async def retrieve_attendance(
    attendance_id: uuid.UUID,
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    check_roles(current, READ_ROLES)
    stmt = (await _base_stmt(current, db)).where(Attendance.id == attendance_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise ApiError(404, "Not found.")
    return await _enrich(db, row)


@router.delete("/{attendance_id}/", status_code=204)
async def delete_attendance(
    request: Request,
    attendance_id: uuid.UUID,
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    check_roles(current, ADMIN_ONLY)
    if current.user.role not in (Role.SUPER_ADMIN.value, Role.SCHOOL_ADMIN.value):
        raise ApiError(403, "Only an administrator can delete attendance records.")
    stmt = (await _base_stmt(current, db)).where(Attendance.id == attendance_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise ApiError(404, "Not found.")
    object_id, school_id = row.id, row.school_id
    await db.delete(row)
    await db.flush()
    await log_action(db, request, "delete", user_id=current.user.id, model_name="Attendance", object_id=object_id, school_id=school_id)
