"""Matches apps/core/pagination.py's StandardPagination (DRF PageNumberPagination,
page_size=25, page_size_query_param="page_size", max_page_size=200) byte-for-byte:
same {"count", "next", "previous", "results"} envelope, same query-param names."""
import math
from typing import Generic, TypeVar
from urllib.parse import urlencode

from fastapi import Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

PAGE_SIZE = 25
PAGE_SIZE_QUERY_PARAM = "page_size"
MAX_PAGE_SIZE = 200

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    count: int
    next: str | None
    previous: str | None
    results: list[T]


class PageParams:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        page_size: int = Query(PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, alias=PAGE_SIZE_QUERY_PARAM),
    ):
        self.page = page
        self.page_size = page_size


def _replace_query_param(request: Request, key: str, value: int | None) -> str:
    params = dict(request.query_params)
    if value is None:
        params.pop(key, None)
    else:
        params[key] = str(value)
    url = str(request.url.remove_query_params(keys=list(request.query_params.keys())))
    return f"{url}?{urlencode(params)}" if params else url


async def paginate(
    db: AsyncSession,
    stmt: Select,
    params: PageParams,
    request: Request,
) -> dict:
    """Runs a COUNT + LIMIT/OFFSET pair against `stmt`, matching DRF's PageNumberPagination
    page math exactly, and returns the raw ORM rows for the current page (not yet
    serialized) alongside the DRF-shaped envelope fields."""
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    last_page = max(1, math.ceil(total / params.page_size)) if total else 1
    page = min(params.page, last_page)
    offset = (page - 1) * params.page_size
    rows = (await db.execute(stmt.limit(params.page_size).offset(offset))).scalars().all()

    next_url = _replace_query_param(request, "page", page + 1) if page < last_page else None
    previous_url = None
    if page > 1:
        previous_url = _replace_query_param(request, "page", page - 1 if page > 2 else None)

    return {"count": total, "next": next_url, "previous": previous_url, "results": rows}
