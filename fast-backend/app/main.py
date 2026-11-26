"""FastAPI entrypoint — mirrors backend/config/urls.py's top-level wiring
(health check, CORS, /api/v1/ prefix) and backend/config/settings/base.py's
CORS_ALLOW_CREDENTIALS=True (the frontend's fetch() always sends credentials:"include")."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.academics.router import (
    academic_year_router, classroom_router, course_router, extra_router as academics_extra_router,
    subject_router, teaching_assignment_router,
)
from app.accounts.router_auth import router as auth_router
from app.attendance.router import router as attendance_router
from app.config import get_settings
from app.core.errors import register_exception_handlers
from app.db.base import engine
from app.teachers.router import router as teachers_router

settings = get_settings()

if settings.sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration

    def _sanitize_sentry_event(event, hint):
        request = event.get("request")
        if isinstance(request, dict):
            for key in ("cookies", "data", "query_string"):
                request.pop(key, None)
            url = request.get("url")
            if isinstance(url, str):
                request["url"] = url.split("?", 1)[0]
            headers = request.get("headers")
            if isinstance(headers, dict):
                request["headers"] = {
                    key: value for key, value in headers.items()
                    if key.lower() not in {"authorization", "cookie", "set-cookie", "x-csrftoken"}
                }
        return event

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[FastApiIntegration()],
        send_default_pii=False,
        before_send=_sanitize_sentry_event,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="Oshitech Education ERP API", version="1.0.0", lifespan=lifespan)

register_exception_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])

app.include_router(academic_year_router, prefix="/api/v1/academics")
app.include_router(course_router, prefix="/api/v1/academics")
app.include_router(subject_router, prefix="/api/v1/academics")
app.include_router(classroom_router, prefix="/api/v1/academics")
app.include_router(teaching_assignment_router, prefix="/api/v1/academics")
app.include_router(academics_extra_router, prefix="/api/v1/academics")

app.include_router(teachers_router, prefix="/api/v1")
app.include_router(attendance_router, prefix="/api/v1")


@app.get("/api/health/")
async def health():
    return {"status": "ok"}
