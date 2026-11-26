"""Async SQLAlchemy engine/session — points at the SAME Postgres database the Django
backend uses (see migration plan: shared schema, no separate DB, no data migration)."""
import re
from collections.abc import AsyncGenerator
from urllib.parse import quote

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    pass


# Matches scheme://user:password@host[:port]/db, taking the password greedily up to
# the LAST @ before the host — a literal @ in the password (seen in this project's real
# DATABASE_URL) otherwise gets mis-parsed as part of the host by a naive first-@ split.
_DSN_RE = re.compile(r"^(?P<scheme>postgres(?:ql)?(?:\+\w+)?://)(?P<user>[^:/]+):(?P<password>.*)@(?P<host>[^:@/]+)(?P<port>:\d+)?/(?P<db>.+)$")


def _async_url(database_url: str) -> str:
    """Rewrite Django's sync DATABASE_URL (postgres:// or postgresql://) to the asyncpg
    driver, and percent-encode the password so SQLAlchemy's URL parser never has to
    guess where the password ends and the host begins."""
    match = _DSN_RE.match(database_url)
    if not match:
        return database_url
    parts = match.groupdict()
    encoded_password = quote(parts["password"], safe="")
    return f"postgresql+asyncpg://{parts['user']}:{encoded_password}@{parts['host']}{parts['port'] or ''}/{parts['db']}"


settings = get_settings()
engine = create_async_engine(_async_url(settings.database_url), pool_pre_ping=True)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
