"""Direct port of backend/apps/core/audit.py's log_action/get_client_ip."""
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import AuditLog


def get_client_ip(request: Request, *, use_x_forwarded_for: bool, num_proxies: int | None) -> str | None:
    if use_x_forwarded_for:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            forwarded = [addr.strip() for addr in fwd.split(",") if addr.strip()]
            if forwarded:
                if num_proxies is None:
                    return forwarded[0]
                if len(forwarded) > num_proxies:
                    return forwarded[-(num_proxies + 1)]
    return request.client.host if request.client else None


async def log_action(
    db: AsyncSession,
    request: Request,
    action: str,
    *,
    user_id,
    model_name: str,
    object_id,
    school_id=None,
    changes: dict | None = None,
    use_x_forwarded_for: bool = False,
    num_proxies: int | None = None,
) -> None:
    """Matches Django's log_action(request, action, instance, changes) signature
    loosely — callers pass the resolved model_name/object_id/school_id explicitly
    since FastAPI routes work with Pydantic schemas, not live ORM instances with
    ._meta the way Django's generic helper introspects them."""
    db.add(AuditLog(
        user_id=user_id,
        school_id=school_id,
        action=action,
        model=model_name,
        object_id=str(object_id),
        changes=changes or {},
        ip_address=get_client_ip(request, use_x_forwarded_for=use_x_forwarded_for, num_proxies=num_proxies),
    ))
    await db.commit()
