"""Opt-in real Postgres/Redis auth flow test.

Run only against an explicitly named local restore database and a dedicated
temporary Redis instance; this test never targets the default production services.
"""
import asyncio
import os
import unittest
import uuid
from datetime import datetime, timezone


class AuthIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.environ.get("FASTAPI_DB_INTEGRATION") != "1":
            raise unittest.SkipTest("Set FASTAPI_DB_INTEGRATION=1 to run the local integration test.")

        # Force Cloudflare's dummy test secret key regardless of whatever real Turnstile
        # key is configured in .env for local/manual testing — mirrors backend/config/
        # settings/dev.py's test-only override so the login flow stays testable offline.
        from app.config import get_settings

        os.environ["TURNSTILE_SECRET_KEY"] = "1x0000000000000000000000000000000AA"
        get_settings.cache_clear()

        from redis import Redis
        from sqlalchemy.engine import make_url

        from app.accounts.models import User
        from app.config import get_settings
        from app.core.security.passwords import hash_password
        from app.db.base import _async_url, async_session_maker, engine

        cls.settings = get_settings()
        db_url = make_url(_async_url(cls.settings.database_url))
        expected_db = os.environ.get("FASTAPI_TEST_DATABASE")
        if db_url.host not in {"localhost", "127.0.0.1", "::1"} or db_url.database != expected_db:
            raise RuntimeError("Integration tests require the explicitly named local test database.")

        if os.environ.get("FASTAPI_TEST_REDIS_URL") != cls.settings.redis_cache_url:
            raise RuntimeError("Set FASTAPI_TEST_REDIS_URL to the dedicated temporary Redis URL.")
        redis_url = make_url(cls.settings.redis_cache_url)
        if redis_url.port != 6380:
            raise RuntimeError("Integration tests require the dedicated Redis test port 6380.")

        redis_client = Redis.from_url(
            cls.settings.redis_cache_url,
            decode_responses=False,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        try:
            redis_client.ping()
        finally:
            redis_client.close()

        cls.user_id = uuid.uuid4()
        cls.email = f"fastapi-integration-{cls.user_id.hex}@example.com"
        cls.password = "Test-only-Password-9482!"

        async def create_user():
            async with async_session_maker() as session:
                session.add(User(
                    id=cls.user_id,
                    email=cls.email,
                    password=hash_password(cls.password),
                    first_name="FastAPI",
                    last_name="Integration",
                    role="super_admin",
                    phone="",
                    profile_photo="",
                    is_staff=True,
                    is_superuser=True,
                    is_active=True,
                    date_joined=datetime.now(timezone.utc),
                    school_id=None,
                ))
                await session.commit()
            await engine.dispose()

        asyncio.run(create_user())

    @classmethod
    def tearDownClass(cls):
        if not hasattr(cls, "user_id"):
            return

        from redis import Redis
        from sqlalchemy import delete, select

        from app.accounts.models import BlacklistedToken, OutstandingToken, User
        from app.config import get_settings
        from app.db.base import async_session_maker, engine

        async def cleanup_database():
            async with async_session_maker() as session:
                outstanding_ids = select(OutstandingToken.id).where(
                    OutstandingToken.user_id == cls.user_id
                )
                await session.execute(
                    delete(BlacklistedToken).where(BlacklistedToken.token_id.in_(outstanding_ids))
                )
                await session.execute(
                    delete(OutstandingToken).where(OutstandingToken.user_id == cls.user_id)
                )
                await session.execute(delete(User).where(User.id == cls.user_id))
                await session.commit()
            await engine.dispose()

        try:
            asyncio.run(cleanup_database())
        finally:
            redis_client = Redis.from_url(
                get_settings().redis_cache_url,
                decode_responses=False,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            try:
                keys = list(redis_client.scan_iter(match=f"oshitech:1:auth:*:{cls.user_id}*"))
                if keys:
                    redis_client.delete(*keys)
            finally:
                redis_client.close()

    def test_login_me_refresh_logout(self):
        from fastapi.testclient import TestClient

        from app.core.security.captcha import TURNSTILE_TEST_TOKEN
        from app.main import app

        with TestClient(app, base_url="https://testserver") as client:
            csrf_response = client.get("/api/v1/auth/csrf/")
            self.assertEqual(csrf_response.status_code, 200, csrf_response.text)
            csrf_token = client.cookies.get("csrftoken")
            self.assertTrue(csrf_token)

            login_response = client.post(
                "/api/v1/auth/login/",
                headers={"X-CSRFToken": csrf_token},
                json={
                    "email": self.email,
                    "password": self.password,
                    "turnstile_token": TURNSTILE_TEST_TOKEN,
                },
            )
            self.assertEqual(login_response.status_code, 200, login_response.text)
            self.assertEqual(login_response.json()["user"]["email"], self.email)
            self.assertIsNone(login_response.json()["user"]["school"])

            me_response = client.get("/api/v1/auth/me/")
            self.assertEqual(me_response.status_code, 200, me_response.text)
            self.assertEqual(me_response.json()["email"], self.email)

            refresh_response = client.post(
                "/api/v1/auth/refresh/",
                headers={"X-CSRFToken": csrf_token},
            )
            self.assertEqual(refresh_response.status_code, 200, refresh_response.text)

            password_response = client.post(
                "/api/v1/auth/change-password/",
                headers={"X-CSRFToken": csrf_token},
                json={
                    "current_password": self.password,
                    "new_password": "Test-only-Updated-Password-9482!",
                },
            )
            self.assertEqual(password_response.status_code, 200, password_response.text)

            logout_response = client.post(
                "/api/v1/auth/logout/",
                headers={"X-CSRFToken": csrf_token},
            )
            self.assertEqual(logout_response.status_code, 200, logout_response.text)
            self.assertEqual(client.get("/api/v1/auth/me/").status_code, 401)
