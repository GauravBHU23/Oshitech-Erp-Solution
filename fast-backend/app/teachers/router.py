"""Port of apps/teachers/views.py. TeacherViewSet can't use the generic
tenant_router() factory as-is because TeacherSerializer is UserBackedSerializer —
creating/updating a Teacher also creates/updates its linked User row, which the
factory's generic model(**data) construction doesn't know how to do. So this module
writes custom create/update/list/retrieve/destroy routes directly, matching
TenantModelViewSet's tenant-scoping/role-gating/audit-logging behavior by hand.

Public directory + photo-serving (PublicTeacherDirectoryView/PublicTeacherPhotoView)
is ported minus the actual photo byte-serving endpoint (core/files.py — a shared
streaming/magic-byte helper — is a deferred follow-up, per explicit user decision);
the photo_url field is still returned, just points at a route not live yet.

Route order matters here: Starlette matches routes in registration order, and
"/teachers/{teacher_id}/" would otherwise swallow literal paths like
"/teachers/directory/" (teacher_id="directory" fails UUID parsing -> 422, not a
clean fall-through to the next route) or "/teachers/my-ratings/" / "/teachers/ratings/".
All literal-path routes are therefore registered before the parameterized ones."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.academics.models import ClassRoom, Course, Subject, TeachingAssignment
from app.accounts.models import User
from app.accounts.service import get_user_by_email
from app.core.audit import log_action
from app.core.crud_base import check_roles, resolve_school_id  # reuse the same role/tenant checks TenantModelViewSet uses
from app.core.deps import AuthenticatedUser, get_current_user, get_db_session
from app.core.errors import ApiError
from app.core.pagination import Page, PageParams, paginate
from app.core.roles import ADMIN_ONLY, STAFF_ROLES, Role
from app.core.security.password_validation import validate_password_strength
from app.core.security.passwords import hash_password
from app.students.models import Student
from app.teachers.models import Teacher, TeacherRating
from app.teachers.schemas import TeacherCreate, TeacherOut, TeacherRatingSubmissionIn, TeacherUpdate

router = APIRouter(tags=["teachers"])
MODEL_NAME = "Teacher"


def _teacher_stmt(current: AuthenticatedUser):
    stmt = select(Teacher).options(selectinload(Teacher.user))
    if current.user.role != Role.SUPER_ADMIN.value:
        if not current.user.school_id:
            return stmt.where(False)
        stmt = stmt.where(Teacher.school_id == current.user.school_id)
    if current.user.role == Role.TEACHER.value:
        stmt = stmt.where(Teacher.user_id == current.user.id)
    return stmt


@router.get("/teachers/", response_model=Page[TeacherOut])
async def list_teachers(
    request: Request,
    params: PageParams = Depends(),
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    check_roles(current, STAFF_ROLES)
    return await paginate(db, _teacher_stmt(current).order_by(Teacher.employee_id), params, request)


@router.post("/teachers/", response_model=TeacherOut, status_code=201)
async def create_teacher(
    request: Request,
    body: TeacherCreate,
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    check_roles(current, ADMIN_ONLY)
    school_id = await resolve_school_id(current, db, body.school)

    existing = await get_user_by_email(db, body.email)
    if existing is not None:
        raise ApiError(400, {"email": ["An account with this email already exists."]})
    password_errors = validate_password_strength(body.password)
    if password_errors:
        raise ApiError(400, {"password": password_errors})

    user = User(
        email=body.email.lower(), password=hash_password(body.password),
        first_name=body.first_name, last_name=body.last_name,
        role=Role.TEACHER.value, school_id=school_id,
        date_joined=datetime.now(timezone.utc),
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise ApiError(400, {"email": ["An account with this email already exists."]})

    teacher = Teacher(
        school_id=school_id, user_id=user.id,
        employee_id=body.employee_id, phone=body.phone, qualification=body.qualification,
        is_public=body.is_public, joining_date=body.joining_date, is_active=body.is_active,
    )
    db.add(teacher)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise ApiError(400, "A record with these details already exists.")

    await log_action(db, request, "create", user_id=current.user.id, model_name=MODEL_NAME, object_id=teacher.id, school_id=school_id)
    await db.refresh(teacher, attribute_names=["user"])
    return teacher


# ---------- Public teacher directory (unauthenticated) ----------

@router.get("/teachers/directory/")
async def public_teacher_directory(
    request: Request,
    params: PageParams = Depends(),
    db: AsyncSession = Depends(get_db_session),
):
    """Matches PublicTeacherDirectoryView — AllowAny, no auth, 12/page."""
    from app.schools.models import School

    rating_avg = func.avg(TeacherRating.rating)
    rating_count = func.count(func.distinct(TeacherRating.id))
    base_filters = (Teacher.is_active.is_(True), Teacher.is_public.is_(True), User.is_active.is_(True), School.is_active.is_(True))

    count_stmt = (
        select(func.count(Teacher.id))
        .join(User, Teacher.user_id == User.id)
        .join(School, Teacher.school_id == School.id)
        .where(*base_filters)
    )
    stmt = (
        select(Teacher, User, School.name, rating_avg, rating_count)
        .join(User, Teacher.user_id == User.id)
        .join(School, Teacher.school_id == School.id)
        .outerjoin(TeacherRating, TeacherRating.teacher_id == Teacher.id)
        .where(*base_filters)
        .group_by(Teacher.id, User.id, School.name)
        .order_by(User.first_name, User.last_name)
    )
    page_size = 12
    page_no = max(1, params.page)
    total = (await db.execute(count_stmt)).scalar_one()
    rows = (await db.execute(stmt.limit(page_size).offset((page_no - 1) * page_size))).all()

    results = []
    for teacher, user, school_name, avg_rating, count_rating in rows:
        assignments = (await db.execute(
            select(Subject.name, Course.name)
            .select_from(TeachingAssignment)
            .join(Subject, TeachingAssignment.subject_id == Subject.id)
            .join(Course, Subject.course_id == Course.id)
            .where(TeachingAssignment.teacher_id == teacher.id)
        )).all()
        subjects = sorted({(course_name, subject_name) for subject_name, course_name in assignments})
        results.append({
            "id": str(teacher.id),
            "name": f"{user.first_name} {user.last_name}".strip() or "Teacher",
            "school_name": school_name,
            "photo_url": f"/api/v1/teachers/directory/{teacher.id}/photo/" if user.profile_photo else None,
            "teaching": [{"course": course, "subject": subject} for course, subject in subjects],
            "rating_average": round(float(avg_rating), 1) if avg_rating is not None else None,
            "rating_count": count_rating,
        })
    last_page = max(1, -(-total // page_size)) if total else 1
    next_url = str(request.url.include_query_params(page=page_no + 1)) if page_no < last_page else None
    previous_url = str(request.url.include_query_params(page=page_no - 1)) if page_no > 1 else None
    return {"count": total, "next": next_url, "previous": previous_url, "results": results}


# ---------- Student: my teacher ratings ----------

async def _student_or_403(current: AuthenticatedUser, db: AsyncSession) -> Student:
    if current.user.role != Role.STUDENT.value:
        raise ApiError(403, "Only students can rate teachers.")
    student = (await db.execute(select(Student).where(Student.user_id == current.user.id))).scalar_one_or_none()
    if student is None:
        raise ApiError(403, "An active student profile is required.")
    return student


async def _assigned_teachers(db: AsyncSession, student: Student) -> list[Teacher]:
    if not student.is_active or not student.classroom_id:
        return []
    rows = (await db.execute(
        select(Teacher)
        .options(selectinload(Teacher.user))
        .join(TeachingAssignment, TeachingAssignment.teacher_id == Teacher.id)
        .where(
            TeachingAssignment.classroom_id == student.classroom_id,
            Teacher.is_active.is_(True),
        )
        .distinct()
    )).scalars().all()
    return rows


@router.get("/teachers/my-ratings/")
async def my_teacher_ratings(
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    student = await _student_or_403(current, db)
    teachers = await _assigned_teachers(db, student)
    ratings = {
        r.teacher_id: r for r in (await db.execute(
            select(TeacherRating).where(TeacherRating.student_id == student.id, TeacherRating.teacher_id.in_([t.id for t in teachers]))
        )).scalars().all()
    }
    results = []
    for teacher in teachers:
        assignments = (await db.execute(
            select(Subject.name, Course.name)
            .select_from(TeachingAssignment)
            .join(Subject, TeachingAssignment.subject_id == Subject.id)
            .join(Course, Subject.course_id == Course.id)
            .where(TeachingAssignment.teacher_id == teacher.id, TeachingAssignment.classroom_id == student.classroom_id)
        )).all()
        rating = ratings.get(teacher.id)
        results.append({
            "id": str(teacher.id),
            "name": f"{teacher.user.first_name} {teacher.user.last_name}".strip() or "Teacher",
            "photo_url": f"/api/v1/teachers/directory/{teacher.id}/photo/" if teacher.is_public and teacher.user.profile_photo else None,
            "subjects": [{"course": course, "subject": subject} for subject, course in sorted(assignments)],
            "rating": rating.rating if rating else None,
            "feedback": rating.feedback if rating else "",
        })
    return results


@router.post("/teachers/my-ratings/", status_code=200)
async def submit_teacher_rating(
    body: TeacherRatingSubmissionIn,
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    student = await _student_or_403(current, db)
    if not student.is_active or not student.classroom_id:
        raise ApiError(403, "An active classroom placement is required to rate a teacher.")
    teacher = (await db.execute(
        select(Teacher)
        .join(TeachingAssignment, TeachingAssignment.teacher_id == Teacher.id)
        .where(
            Teacher.id == body.teacher_id, Teacher.school_id == student.school_id, Teacher.is_active.is_(True),
            TeachingAssignment.classroom_id == student.classroom_id,
        )
        .distinct()
    )).scalar_one_or_none()
    if teacher is None:
        raise ApiError(404, "Not found.")

    existing = (await db.execute(
        select(TeacherRating).where(TeacherRating.student_id == student.id, TeacherRating.teacher_id == teacher.id)
    )).scalar_one_or_none()
    created = existing is None
    if existing is None:
        existing = TeacherRating(school_id=student.school_id, student_id=student.id, teacher_id=teacher.id)
        db.add(existing)
    existing.rating = body.rating
    existing.feedback = body.feedback
    await db.flush()
    await db.commit()
    return JSONResponse(
        status_code=201 if created else 200,
        content={"id": str(existing.id), "rating": existing.rating, "feedback": existing.feedback},
    )


# ---------- Admin: all ratings ----------

@router.get("/teachers/ratings/")
async def admin_teacher_ratings(
    request: Request,
    params: PageParams = Depends(),
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    check_roles(current, ADMIN_ONLY)
    from app.schools.models import School

    stmt = select(TeacherRating).join(Teacher, TeacherRating.teacher_id == Teacher.id).join(Student, TeacherRating.student_id == Student.id)
    if current.user.role != Role.SUPER_ADMIN.value:
        stmt = stmt.where(TeacherRating.school_id == current.user.school_id)
    stmt = stmt.order_by(TeacherRating.updated_at.desc())
    page = await paginate(db, stmt, params, request)

    results = []
    for rating in page["results"]:
        teacher = (await db.execute(select(Teacher).where(Teacher.id == rating.teacher_id))).scalar_one()
        student = (await db.execute(select(Student).where(Student.id == rating.student_id))).scalar_one()
        teacher_user = (await db.execute(select(User).where(User.id == teacher.user_id))).scalar_one()
        student_user = (await db.execute(select(User).where(User.id == student.user_id))).scalar_one()
        school = (await db.execute(select(School).where(School.id == rating.school_id))).scalar_one()
        results.append({
            "id": str(rating.id),
            "teacher_name": f"{teacher_user.first_name} {teacher_user.last_name}".strip() or "Teacher",
            "student_name": f"{student_user.first_name} {student_user.last_name}".strip() or "Student",
            "school_name": school.name,
            "rating": rating.rating,
            "feedback": rating.feedback,
            "updated_at": rating.updated_at,
        })
    page["results"] = results
    return page


# ---------- Standard CRUD on a single teacher (parameterized paths last — see module docstring) ----------

@router.get("/teachers/{teacher_id}/", response_model=TeacherOut)
async def retrieve_teacher(
    teacher_id: uuid.UUID,
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    check_roles(current, STAFF_ROLES)
    teacher = (await db.execute(_teacher_stmt(current).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if teacher is None:
        raise ApiError(404, "Not found.")
    return teacher


@router.patch("/teachers/{teacher_id}/", response_model=TeacherOut)
async def update_teacher(
    request: Request,
    teacher_id: uuid.UUID,
    body: TeacherUpdate,
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    check_roles(current, ADMIN_ONLY)
    teacher = (await db.execute(_teacher_stmt(current).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if teacher is None:
        raise ApiError(404, "Not found.")
    data = body.model_dump(exclude_unset=True)
    old = {f: str(getattr(teacher, f, None)) for f in data if hasattr(teacher, f)}

    user_fields = {k: data.pop(k) for k in ("email", "first_name", "last_name", "password") if k in data}
    if "email" in user_fields:
        existing = await get_user_by_email(db, user_fields["email"])
        if existing is not None and existing.id != teacher.user_id:
            raise ApiError(400, {"email": ["An account with this email already exists."]})
        teacher.user.email = user_fields["email"].lower()
    if "first_name" in user_fields:
        teacher.user.first_name = user_fields["first_name"]
    if "last_name" in user_fields:
        teacher.user.last_name = user_fields["last_name"]
    if "password" in user_fields:
        password_errors = validate_password_strength(user_fields["password"])
        if password_errors:
            raise ApiError(400, {"password": password_errors})
        teacher.user.password = hash_password(user_fields["password"])

    is_active = data.pop("is_active", None)
    for field, value in data.items():
        setattr(teacher, field, value)
    if is_active is not None:
        teacher.is_active = is_active
        teacher.user.is_active = is_active

    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise ApiError(400, "A record with these details already exists.")

    new = {f: str(getattr(teacher, f, None)) for f in data}
    await log_action(
        db, request, "update", user_id=current.user.id, model_name=MODEL_NAME, object_id=teacher.id,
        school_id=teacher.school_id, changes={"old": old, "new": new},
    )
    await db.refresh(teacher, attribute_names=["user"])
    return teacher


@router.delete("/teachers/{teacher_id}/", status_code=204)
async def delete_teacher(
    request: Request,
    teacher_id: uuid.UUID,
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    check_roles(current, ADMIN_ONLY)
    teacher = (await db.execute(_teacher_stmt(current).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if teacher is None:
        raise ApiError(404, "Not found.")
    object_id, school_id = teacher.id, teacher.school_id
    await db.delete(teacher)
    await db.flush()
    await log_action(db, request, "delete", user_id=current.user.id, model_name=MODEL_NAME, object_id=object_id, school_id=school_id)
