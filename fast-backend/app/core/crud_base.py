"""tenant_router() — FastAPI factory equivalent of apps/core/viewsets.py's
TenantModelViewSet. Generates list/retrieve/create/update/destroy routes that are:
  - tenant-scoped (WHERE school_id = user.school_id, unless super_admin)
  - role-gated per HTTP verb (read_roles for GET, write_roles for POST/PUT/PATCH/DELETE)
  - audit-logged on create/update/delete, matching log_action(request, action, instance)
  - school-resolved on create the same way _resolve_school() does: super_admin must pass
    a `school` id in the body, everyone else gets their own user.school_id silently

Each of the ~30 tenant models gets a small router module that calls this factory and
then adds its own extra_routes/custom business-logic endpoints on the returned
APIRouter — the factory only replaces the generic CRUD boilerplate, not every view.
"""
from collections.abc import Awaitable, Callable
from typing import Any, Generic, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.core.audit import log_action
from app.core.deps import AuthenticatedUser, get_current_user, get_db_session
from app.core.errors import ApiError
from app.core.pagination import Page, PageParams, paginate
from app.core.roles import Role
from app.db.base import Base

ModelT = TypeVar("ModelT", bound=Base)
ReadT = TypeVar("ReadT", bound=BaseModel)
CreateT = TypeVar("CreateT", bound=BaseModel)
UpdateT = TypeVar("UpdateT", bound=BaseModel)

QuerysetScope = Callable[[Select, AuthenticatedUser, AsyncSession], Awaitable[Select]]
AuditExtractor = Callable[[ModelT], dict[str, Any]]
AfterSaveHook = Callable[[AsyncSession, ModelT], Awaitable[None]]


def check_roles(current: AuthenticatedUser, roles: list[Role]) -> None:
    """Matches apps/core/permissions.py's RoleAccess exactly."""
    if current.user.role == Role.SUPER_ADMIN.value:
        return
    if not current.user.school_id:
        raise ApiError(status.HTTP_403_FORBIDDEN, "You do not have permission to perform this action.")
    if current.user.role not in {r.value for r in roles}:
        raise ApiError(status.HTTP_403_FORBIDDEN, "You do not have permission to perform this action.")


async def resolve_school_id(current: AuthenticatedUser, db: AsyncSession, body_school: UUID | str | None) -> UUID:
    """Matches TenantModelViewSet._resolve_school(): super_admin must supply a valid
    `school` id in the request body; every other role silently gets their own school."""
    if current.user.role != Role.SUPER_ADMIN.value:
        return current.user.school_id
    from app.schools.models import School

    school = None
    if body_school:
        school = (await db.execute(select(School).where(School.id == body_school))).scalar_one_or_none()
    if school is None:
        raise ApiError(status.HTTP_400_BAD_REQUEST, {"school": ["A valid school ID is required for a Super Admin."]})
    return school.id


def _scope_to_tenant(stmt: Select, model: type[ModelT], current: AuthenticatedUser) -> Select:
    if current.user.role == Role.SUPER_ADMIN.value:
        return stmt
    if not current.user.school_id:
        return stmt.where(False)  # qs.none()
    return stmt.where(model.school_id == current.user.school_id)


def tenant_router(
    *,
    prefix: str,
    tag: str,
    model: type[ModelT],
    read_schema: type[ReadT],
    create_schema: type[CreateT] | None,
    update_schema: type[UpdateT] | None,
    read_roles: list[Role],
    write_roles: list[Role],
    queryset_scope: QuerysetScope | None = None,
    order_by: Any = None,
    enable_create: bool = True,
    enable_update: bool = True,
    enable_destroy: bool = True,
    audit_changes: AuditExtractor | None = None,
    after_save: AfterSaveHook | None = None,
) -> APIRouter:
    router = APIRouter(prefix=prefix, tags=[tag])
    model_name = model.__name__

    async def _base_stmt(current: AuthenticatedUser, db: AsyncSession) -> Select:
        stmt = select(model)
        stmt = _scope_to_tenant(stmt, model, current)
        if queryset_scope is not None:
            stmt = await queryset_scope(stmt, current, db)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        return stmt

    async def _get_or_404(db: AsyncSession, current: AuthenticatedUser, obj_id: UUID) -> ModelT:
        stmt = (await _base_stmt(current, db)).where(model.id == obj_id)
        obj = (await db.execute(stmt)).scalar_one_or_none()
        if obj is None:
            raise ApiError(status.HTTP_404_NOT_FOUND, "Not found.")
        return obj

    @router.get("/", response_model=Page[read_schema])
    async def list_(
        request: Request,
        params: PageParams = Depends(),
        current: AuthenticatedUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ):
        check_roles(current, read_roles)
        return await paginate(db, await _base_stmt(current, db), params, request)

    @router.get("/{obj_id}/", response_model=read_schema)
    async def retrieve(
        obj_id: UUID,
        current: AuthenticatedUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db_session),
    ):
        check_roles(current, read_roles)
        return await _get_or_404(db, current, obj_id)

    if enable_create and create_schema is not None:
        @router.post("/", response_model=read_schema, status_code=status.HTTP_201_CREATED)
        async def create(
            request: Request,
            body: create_schema,
            current: AuthenticatedUser = Depends(get_current_user),
            db: AsyncSession = Depends(get_db_session),
        ):
            check_roles(current, write_roles)
            data = body.model_dump(exclude_unset=True)
            body_school = data.pop("school", None)
            school_id = await resolve_school_id(current, db, body_school)
            instance = model(**data, school_id=school_id)
            db.add(instance)
            try:
                await db.flush()
            except IntegrityError:
                await db.rollback()
                raise ApiError(status.HTTP_400_BAD_REQUEST, "A record with these details already exists.")
            if after_save is not None:
                await after_save(db, instance)
            await log_action(
                db, request, "create",
                user_id=current.user.id, model_name=model_name, object_id=instance.id, school_id=school_id,
            )  # log_action() commits — finalizes the create (+ after_save side effects) + the audit row in one transaction
            await db.refresh(instance)
            return instance

    if enable_update and update_schema is not None:
        @router.patch("/{obj_id}/", response_model=read_schema)
        async def update(
            request: Request,
            obj_id: UUID,
            body: update_schema,
            current: AuthenticatedUser = Depends(get_current_user),
            db: AsyncSession = Depends(get_db_session),
        ):
            check_roles(current, write_roles)
            instance = await _get_or_404(db, current, obj_id)
            data = body.model_dump(exclude_unset=True)
            old = {f: str(getattr(instance, f, None)) for f in data if hasattr(instance, f)} if audit_changes is None else audit_changes(instance)
            for field, value in data.items():
                setattr(instance, field, value)
            try:
                await db.flush()
            except IntegrityError:
                await db.rollback()
                raise ApiError(status.HTTP_400_BAD_REQUEST, "A record with these details already exists.")
            new = {f: str(getattr(instance, f, None)) for f in data} if audit_changes is None else audit_changes(instance)
            if after_save is not None:
                await after_save(db, instance)
            await log_action(
                db, request, "update",
                user_id=current.user.id, model_name=model_name, object_id=instance.id,
                school_id=instance.school_id, changes={"old": old, "new": new},
            )  # log_action() commits — finalizes the update (+ after_save side effects) + the audit row in one transaction
            await db.refresh(instance)
            return instance

    if enable_destroy:
        @router.delete("/{obj_id}/", status_code=status.HTTP_204_NO_CONTENT)
        async def destroy(
            request: Request,
            obj_id: UUID,
            current: AuthenticatedUser = Depends(get_current_user),
            db: AsyncSession = Depends(get_db_session),
        ):
            check_roles(current, write_roles)
            instance = await _get_or_404(db, current, obj_id)
            object_id, school_id = instance.id, instance.school_id
            await db.delete(instance)
            await db.flush()
            await log_action(
                db, request, "delete",
                user_id=current.user.id, model_name=model_name, object_id=object_id, school_id=school_id,
            )  # log_action() commits — finalizes the delete + the audit row in one transaction

    return router
