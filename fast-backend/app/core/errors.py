"""Exception handlers that shape every error response to match DRF's JSON format —
required because frontend/src/lib/api.ts's flatten() parses exactly this shape to
build user-facing toast messages:
    {"detail": "message"}                      <- simple errors (403, 404, 500, etc.)
    {"field_name": ["error", ...], ...}         <- validation errors, per field
    {"non_field_errors": ["error", ...]}        <- cross-field validation errors

FastAPI's own default validation-error shape
    {"detail": [{"loc": [...], "msg": ..., "type": ...}, ...]}
must NEVER leak through anywhere a form submission could trigger it — the
RequestValidationError handler below converts it to the DRF shape instead.
"""
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    """Raise this (instead of a raw dict) from service-layer code for a DRF-style
    error whose shape is already field->[errors] or {"detail": ...} — avoids every
    call site re-building the HTTPException(detail=...) boilerplate."""

    def __init__(self, status_code: int, errors: dict | str):
        self.status_code = status_code
        self.errors = {"detail": errors} if isinstance(errors, str) else errors


def _pydantic_errors_to_drf(exc: RequestValidationError) -> dict:
    """FastAPI's ValidationError.errors() items have `loc` like ("body", "email") or
    ("query", "page"). We only care about the field name (last element of loc, skipping
    the body/query/path marker) — matches how a DRF serializer reports per-field errors."""
    fields: dict[str, list[str]] = {}
    for err in exc.errors():
        loc = err.get("loc", ())
        field = str(loc[-1]) if loc else "non_field_errors"
        fields.setdefault(field, []).append(err.get("msg", "Invalid value."))
    return fields


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content=_pydantic_errors_to_drf(exc))

    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status_code, content=exc.errors)

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        # Routes that already raise HTTPException with a DRF-shaped dict `detail`
        # (e.g. {"detail": "..."} or {"field": [...]}) pass through unchanged; a plain
        # string detail is wrapped the same way DRF always wraps its own {"detail": ...}.
        content = exc.detail if isinstance(exc.detail, dict) else {"detail": exc.detail}
        return JSONResponse(status_code=exc.status_code, content=content, headers=getattr(exc, "headers", None))

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": "The server had a problem. Please try again in a moment."})
