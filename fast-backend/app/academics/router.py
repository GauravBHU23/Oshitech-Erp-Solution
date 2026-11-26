"""Port of apps/academics/views.py — AcademicYear/Course/Subject/ClassRoom/
TeachingAssignment viewsets, built on tenant_router(), plus the student-scoped
get_queryset overrides and the seed-classes custom action."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.academics.models import AcademicYear, ClassRoom, Course, Subject, TeachingAssignment
from app.academics.schemas import (
    AcademicYearCreate, AcademicYearOut, AcademicYearUpdate,
    ClassRoomCreate, ClassRoomOut, ClassRoomUpdate,
    CourseCreate, CourseOut, CourseUpdate,
    SubjectCreate, SubjectOut, SubjectUpdate,
    TeachingAssignmentCreate, TeachingAssignmentOut, TeachingAssignmentUpdate,
)
from app.core.audit import log_action
from app.core.crud_base import check_roles, resolve_school_id, tenant_router
from app.core.deps import AuthenticatedUser, get_current_user, get_db_session
from app.core.roles import ADMIN_ONLY, ALL_SCHOOL_ROLES, Role
from app.students.models import Student

# School ke liye standard Class 1-12 course list (aur common subjects) — matches
# apps/academics/views.py's SCHOOL_CLASSES / DEFAULT_SUBJECTS exactly.
SCHOOL_CLASSES = [(str(n), f"Class {n}") for n in range(1, 13)]
DEFAULT_SUBJECTS = {
    "primary": [("English", "ENG"), ("Hindi", "HIN"), ("Mathematics", "MAT"), ("Environmental Studies", "EVS")],
    "middle": [("English", "ENG"), ("Hindi", "HIN"), ("Mathematics", "MAT"), ("Science", "SCI"), ("Social Science", "SST"), ("Sanskrit", "SAN"), ("Computer", "CMP")],
    "secondary": [("English", "ENG"), ("Hindi", "HIN"), ("Mathematics", "MAT"), ("Science", "SCI"), ("Social Science", "SST"), ("Computer", "CMP")],
    "senior": [("English", "ENG"), ("Physics", "PHY"), ("Chemistry", "CHE"), ("Mathematics", "MAT"), ("Biology", "BIO"), ("Computer Science", "CS"), ("Physical Education", "PE")],
}


def _subjects_for(level: str):
    n = int(level)
    if n <= 5:
        return DEFAULT_SUBJECTS["primary"]
    if n <= 8:
        return DEFAULT_SUBJECTS["middle"]
    if n <= 10:
        return DEFAULT_SUBJECTS["secondary"]
    return DEFAULT_SUBJECTS["senior"]


async def _active_student(db: AsyncSession, user) -> Student | None:
    return (await db.execute(
        select(Student).where(Student.user_id == user.id, Student.is_active.is_(True))
    )).scalar_one_or_none()


async def _student_scope_academic_year(stmt: Select, current: AuthenticatedUser, db: AsyncSession) -> Select:
    """Matches AcademicYearViewSet.get_queryset(): a student only sees academic years
    that have a classroom they're placed in."""
    if current.user.role != Role.STUDENT.value:
        return stmt
    student = await _active_student(db, current.user)
    if student is None or not student.classroom_id:
        return stmt.where(False)
    classroom = (await db.execute(select(ClassRoom).where(ClassRoom.id == student.classroom_id))).scalar_one_or_none()
    if classroom is None:
        return stmt.where(False)
    return stmt.where(AcademicYear.id == classroom.academic_year_id)


async def _student_scope_course(stmt: Select, current: AuthenticatedUser, db: AsyncSession) -> Select:
    """Matches CourseViewSet.get_queryset(): a student only sees their own course."""
    if current.user.role != Role.STUDENT.value:
        return stmt
    student = await _active_student(db, current.user)
    if student is None or not student.classroom_id:
        return stmt.where(False)
    classroom = (await db.execute(select(ClassRoom).where(ClassRoom.id == student.classroom_id))).scalar_one_or_none()
    if classroom is None:
        return stmt.where(False)
    return stmt.where(Course.id == classroom.course_id)


async def _student_scope_subject(stmt: Select, current: AuthenticatedUser, db: AsyncSession) -> Select:
    """Matches SubjectViewSet.get_queryset(): a student only sees subjects under
    their own course."""
    if current.user.role != Role.STUDENT.value:
        return stmt
    student = await _active_student(db, current.user)
    if student is None or not student.classroom_id:
        return stmt.where(False)
    classroom = (await db.execute(select(ClassRoom).where(ClassRoom.id == student.classroom_id))).scalar_one_or_none()
    if classroom is None:
        return stmt.where(False)
    return stmt.where(Subject.course_id == classroom.course_id)


async def _role_scope_classroom(stmt: Select, current: AuthenticatedUser, db: AsyncSession) -> Select:
    """Matches ClassRoomViewSet.get_queryset(): students see only their own
    classroom; teachers see classrooms they're the class-teacher of OR assigned to."""
    if current.user.role == Role.STUDENT.value:
        student = await _active_student(db, current.user)
        if student is None or not student.classroom_id:
            return stmt.where(False)
        return stmt.where(ClassRoom.id == student.classroom_id)
    if current.user.role == Role.TEACHER.value:
        from app.teachers.models import Teacher
        teacher = (await db.execute(select(Teacher).where(Teacher.user_id == current.user.id))).scalar_one_or_none()
        if teacher is None:
            return stmt.where(False)
        assigned_classroom_ids = (await db.execute(
            select(TeachingAssignment.classroom_id).where(TeachingAssignment.teacher_id == teacher.id)
        )).scalars().all()
        return stmt.where(or_(ClassRoom.class_teacher_id == teacher.id, ClassRoom.id.in_(assigned_classroom_ids)))
    return stmt


async def _role_scope_teaching_assignment(stmt: Select, current: AuthenticatedUser, db: AsyncSession) -> Select:
    """Matches TeachingAssignmentViewSet.get_queryset(): students see none; teachers
    see only their own assignments."""
    if current.user.role == Role.STUDENT.value:
        return stmt.where(False)
    if current.user.role == Role.TEACHER.value:
        from app.teachers.models import Teacher
        teacher = (await db.execute(select(Teacher).where(Teacher.user_id == current.user.id))).scalar_one_or_none()
        if teacher is None:
            return stmt.where(False)
        return stmt.where(TeachingAssignment.teacher_id == teacher.id)
    return stmt


async def _unset_other_current_years(db: AsyncSession, instance: AcademicYear) -> None:
    """Matches AcademicYearSerializer.save(): only one "current" academic year per
    school at a time."""
    if instance.is_current:
        await db.execute(
            update(AcademicYear)
            .where(AcademicYear.school_id == instance.school_id, AcademicYear.is_current.is_(True), AcademicYear.id != instance.id)
            .values(is_current=False)
        )


academic_year_router = tenant_router(
    prefix="/academic-years", tag="academic-years", model=AcademicYear,
    read_schema=AcademicYearOut, create_schema=AcademicYearCreate, update_schema=AcademicYearUpdate,
    read_roles=ALL_SCHOOL_ROLES, write_roles=ADMIN_ONLY,
    order_by=AcademicYear.start_date.desc(),
    queryset_scope=_student_scope_academic_year,
    after_save=_unset_other_current_years,
)

course_router = tenant_router(
    prefix="/courses", tag="courses", model=Course,
    read_schema=CourseOut, create_schema=CourseCreate, update_schema=CourseUpdate,
    read_roles=ALL_SCHOOL_ROLES, write_roles=ADMIN_ONLY,
    order_by=Course.name,
    queryset_scope=_student_scope_course,
)

subject_router = tenant_router(
    prefix="/subjects", tag="subjects", model=Subject,
    read_schema=SubjectOut, create_schema=SubjectCreate, update_schema=SubjectUpdate,
    read_roles=ALL_SCHOOL_ROLES, write_roles=ADMIN_ONLY,
    order_by=Subject.name,
    queryset_scope=_student_scope_subject,
)

classroom_router = tenant_router(
    prefix="/classrooms", tag="classrooms", model=ClassRoom,
    read_schema=ClassRoomOut, create_schema=ClassRoomCreate, update_schema=ClassRoomUpdate,
    read_roles=ALL_SCHOOL_ROLES, write_roles=ADMIN_ONLY,
    queryset_scope=_role_scope_classroom,
)

teaching_assignment_router = tenant_router(
    prefix="/teaching-assignments", tag="teaching-assignments", model=TeachingAssignment,
    read_schema=TeachingAssignmentOut, create_schema=TeachingAssignmentCreate, update_schema=TeachingAssignmentUpdate,
    read_roles=ALL_SCHOOL_ROLES, write_roles=ADMIN_ONLY,
    queryset_scope=_role_scope_teaching_assignment,
)


extra_router = APIRouter(tags=["courses"])


@extra_router.post("/courses/seed-classes/")
async def seed_classes(
    request: Request,
    school: str | None = None,
    with_subjects: bool = True,
    current: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Class 1 se 12 tak courses (aur unke default subjects) ek click me bana deta hai.
    Matches CourseViewSet.seed_classes — admin-only (action_roles = {"seed_classes": ADMIN_ONLY}),
    and resolves the target school exactly like _resolve_school(): super_admin must pass
    a `school` id, everyone else gets their own school."""
    check_roles(current, ADMIN_ONLY)
    school_id = await resolve_school_id(current, db, school)

    created_courses = created_subjects = 0
    for level, name in SCHOOL_CLASSES:
        course = (await db.execute(
            select(Course).where(Course.school_id == school_id, Course.name.ilike(name))
        )).scalar_one_or_none()
        created = False
        if course is None:
            course = (await db.execute(
                select(Course).where(Course.school_id == school_id, Course.code == f"CLS{level}")
            )).scalar_one_or_none()
            if course is None:
                course = Course(school_id=school_id, code=f"CLS{level}", name=name, description=f"School {name}")
                db.add(course)
                await db.flush()
                created = True
        created_courses += int(created)
        if with_subjects:
            for subject_name, code in _subjects_for(level):
                subject_code = f"{code}{level}"
                existing = (await db.execute(
                    select(Subject).where(Subject.school_id == school_id, Subject.code == subject_code)
                )).scalar_one_or_none()
                if existing is None:
                    db.add(Subject(school_id=school_id, course_id=course.id, name=subject_name, code=subject_code))
                    await db.flush()
                    created_subjects += 1

    await log_action(
        db, request, "seed_classes",
        user_id=current.user.id, model_name="School", object_id=school_id, school_id=school_id,
        changes={"courses": created_courses, "subjects": created_subjects},
    )
    return {
        "courses": created_courses,
        "subjects": created_subjects,
        "detail": f"{created_courses} classes and {created_subjects} subjects created (existing ones were kept).",
    }
