from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.conf import settings
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.roles import Role
from apps.schools.models import School
from apps.teachers.models import Teacher

User = get_user_model()


class AdminLoginSecurityTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_django_admin_login_requires_captcha_challenge(self):
        response = self.client.get(reverse("admin:login"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "I'm not a robot")
        self.assertContains(response, "cf-turnstile")
        self.assertContains(response, "data:image/svg+xml;base64,")
        self.assertTrue(self.client.session.get("admin_login_captcha_id"))

    def test_django_admin_login_uses_account_lockout(self):
        from unittest.mock import patch

        user = User.objects.create_user(
            email="staff@admin-test.example", password="Strong-Password-73!", is_staff=True
        )
        self.client.get(reverse("admin:login"))
        with patch("apps.accounts.admin_auth.captcha_security.check_captcha"), patch("apps.accounts.admin_auth.captcha_security.check_turnstile"):
            for _ in range(5):
                session = self.client.session
                response = self.client.post(reverse("admin:login"), {
                    "username": user.email,
                    "password": "incorrect",
                    "captcha_id": session["admin_login_captcha_id"],
                    "captcha": "ABCDE",
                    "cf-turnstile-response": "test-token",
                })
                self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.is_locked)

    def test_django_admin_session_expires_after_idle_time(self):
        import time

        user = User.objects.create_superuser(
            email="staff@idle-test.example", password="Strong-Password-74!"
        )
        self.client.force_login(user)
        session = self.client.session
        session["admin_session_started_at"] = time.time() - 3600
        session["admin_last_activity_at"] = time.time() - 3600
        session.save()

        response = self.client.get(reverse("admin:index"))
        self.assertEqual(response.status_code, 302)
        self.assertIn("reason=expired", response.url)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.PBKDF2PasswordHasher"])
class PasswordManagementTests(APITestCase):
    current_password = "Current-Password-42!"
    new_password = "New-Secure-Password-57!"

    def setUp(self):
        self.school = School.objects.create(name="Password Test School", code="PWTEST")
        self.teacher = User.objects.create_user(
            email="teacher@password-test.example",
            password=self.current_password,
            role=Role.TEACHER,
            school=self.school,
        )
        self.super_admin = User.objects.create_superuser(
            email="admin@password-test.example",
            password="Admin-Password-83!",
        )

    def test_user_changes_password_and_receives_a_new_session(self):
        old_refresh = RefreshToken.for_user(self.teacher)
        self.client.force_authenticate(self.teacher)

        response = self.client.post(
            "/api/v1/auth/change-password/",
            {
                "current_password": self.current_password,
                "new_password": self.new_password,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.teacher.refresh_from_db()
        self.assertTrue(self.teacher.check_password(self.new_password))
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=old_refresh["jti"]).exists()
        )
        new_refresh = RefreshToken(response.cookies["refresh_token"].value)
        self.assertFalse(
            BlacklistedToken.objects.filter(token__jti=new_refresh["jti"]).exists()
        )

    def test_wrong_current_password_does_not_change_password(self):
        self.client.force_authenticate(self.teacher)

        response = self.client.post(
            "/api/v1/auth/change-password/",
            {
                "current_password": "Incorrect-Password-42!",
                "new_password": self.new_password,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.teacher.refresh_from_db()
        self.assertTrue(self.teacher.check_password(self.current_password))

    def test_password_policy_is_enforced(self):
        self.client.force_authenticate(self.teacher)

        response = self.client.post(
            "/api/v1/auth/change-password/",
            {
                "current_password": self.current_password,
                "new_password": "short",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.teacher.refresh_from_db()
        self.assertTrue(self.teacher.check_password(self.current_password))

    def test_super_admin_can_reset_an_account_and_revoke_its_refresh_tokens(self):
        old_refresh = RefreshToken.for_user(self.teacher)
        reset_password = "Temporary-Reset-Password-64!"
        self.client.force_authenticate(self.super_admin)

        response = self.client.post(
            f"/api/v1/auth/users/{self.teacher.pk}/reset-password/",
            {"password": reset_password},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.teacher.refresh_from_db()
        self.assertTrue(self.teacher.check_password(reset_password))
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=old_refresh["jti"]).exists()
        )

    def test_non_admin_cannot_reset_another_accounts_password(self):
        self.client.force_authenticate(self.teacher)

        response = self.client.post(
            f"/api/v1/auth/users/{self.super_admin.pk}/reset-password/",
            {"password": "Temporary-Reset-Password-64!"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_admin_can_link_existing_teacher_login_without_changing_password(self):
        self.client.force_authenticate(self.super_admin)

        response = self.client.post(
            f"/api/v1/auth/users/{self.teacher.pk}/create-teacher-profile/",
            {"employee_id": "T-100", "qualification": "B.Ed"},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        profile = Teacher.objects.get(user=self.teacher)
        self.assertEqual(profile.school_id, self.school.id)
        self.assertEqual(profile.employee_id, "T-100")
        self.assertFalse(profile.is_active)
        self.teacher.refresh_from_db()
        self.assertTrue(self.teacher.check_password(self.current_password))
        self.assertTrue(self.teacher.is_active)
        self.assertEqual(response.data["profile_id"], str(profile.pk))

    def test_teacher_profile_link_rejects_duplicate_employee_id_and_existing_profile(self):
        self.client.force_authenticate(self.super_admin)

        first = self.client.post(
            f"/api/v1/auth/users/{self.teacher.pk}/create-teacher-profile/",
            {"employee_id": "T-100"},
            format="json",
        )
        self.assertEqual(first.status_code, 201, first.data)

        other_teacher = User.objects.create_user(
            email="other-teacher@password-test.example",
            password=self.current_password,
            role=Role.TEACHER,
            school=self.school,
        )
        duplicate = self.client.post(
            f"/api/v1/auth/users/{other_teacher.pk}/create-teacher-profile/",
            {"employee_id": "T-100"},
            format="json",
        )
        self.assertEqual(duplicate.status_code, 400)

        existing = self.client.post(
            f"/api/v1/auth/users/{self.teacher.pk}/create-teacher-profile/",
            {"employee_id": "T-101"},
            format="json",
        )
        self.assertEqual(existing.status_code, 400)


class SessionTimeoutTests(APITestCase):
    """Idle timeout + absolute session ceiling (values come from settings)."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        from apps.core.tests import make_school
        self.data = make_school("s")

    def login(self):
        self.client.get("/api/v1/auth/csrf/")
        self.client.credentials(HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)
        from .testutils import login_payload
        res = self.client.post("/api/v1/auth/login/", login_payload("admin@s.com", "Str0ng-Passw0rd!"), format="json")
        self.assertEqual(res.status_code, 200, res.data)
        return res

    def refresh(self):
        csrf = self.client.cookies["csrftoken"].value
        return self.client.post("/api/v1/auth/refresh/", HTTP_X_CSRFTOKEN=csrf)

    def test_login_returns_session_info_and_refresh_keeps_auth_time(self):
        res = self.login()
        self.assertEqual(res.data["session"]["idle_minutes"], settings.SESSION_IDLE_MINUTES)
        self.assertIn("expires_at", res.data["session"])
        r = self.refresh()
        self.assertEqual(r.status_code, 200, r.data)
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken(self.client.cookies["refresh_token"].value)
        self.assertTrue(token.get("auth_time"))
        self.assertTrue(token.get("sid"))

    def test_second_login_logs_out_the_first_session(self):
        """Ek account, ek hi active session: naya login purane device ka session turant revoke kare."""
        from django.test import Client

        first_device = self.login()
        first_access_cookie = first_device.cookies["access_token"].value

        # Dusre device se same account se login
        self.client.cookies.clear()
        self.login()

        # Pehle device ka access cookie ab bhi cryptographically valid hai, lekin server-side
        # session revoke ho chuka hai -- isliye agli request turant reject honi chahiye.
        first_device_client = Client()
        first_device_client.cookies["access_token"] = first_access_cookie
        res = first_device_client.get("/api/v1/auth/me/")
        self.assertEqual(res.status_code, 401, res.content)

    def test_logout_revokes_access_token_immediately(self):
        self.login()
        self.client.post("/api/v1/auth/logout/", HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)

    def test_revoked_session_id_rejects_access_token(self):
        from django.core.cache import cache
        from rest_framework_simplejwt.tokens import AccessToken

        self.login()
        token = AccessToken(self.client.cookies["access_token"].value)
        cache.delete(f"auth:session:{token['user_id']}:{token['sid']}")
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)

    def test_session_older_than_max_hours_is_rejected(self):
        self.login()
        import time
        from unittest import mock
        with mock.patch("time.time", return_value=time.time() + 13 * 3600):
            r = self.refresh()
        self.assertEqual(r.status_code, 401)
        self.assertEqual(self.client.cookies["refresh_token"].value, "")

    def test_old_token_without_auth_time_rejected(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        from django.contrib.auth import get_user_model
        user = get_user_model().objects.get(email="admin@s.com")
        self.client.get("/api/v1/auth/csrf/")
        self.client.cookies["refresh_token"] = str(RefreshToken.for_user(user))
        self.assertEqual(self.refresh().status_code, 401)


class ForgotPasswordTests(APITestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        from apps.core.tests import make_school
        from apps.students.tests import make_student
        self.data = make_school("f")
        self.student = make_student(self.data, 1)  # s1@f.com

    def code(self):
        import re

        from django.core import mail
        return re.search(r"Verification code:\s*(\d+)", mail.outbox[-1].body).group(1)

    def reset_request(self, **overrides):
        from datetime import timedelta

        from django.utils import timezone

        from apps.stre.models import StreCaptcha
        from apps.stre.security import TURNSTILE_TEST_TOKEN, _hash

        captcha = StreCaptcha.objects.create(answer_hash=_hash("ABCDE"), expires_at=timezone.now() + timedelta(minutes=5))
        body = {"captcha_id": str(captcha.pk), "captcha": "ABCDE", "turnstile_token": TURNSTILE_TEST_TOKEN}
        body.update(overrides)
        return self.client.post("/api/v1/auth/forgot-password/", body, format="json")

    def test_full_reset_flow(self):
        from django.core import mail
        res = self.reset_request(email="S1@f.com", portal="student")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        code = self.code()
        weak = self.client.post("/api/v1/auth/forgot-password/confirm/", {"email": "s1@f.com", "code": code, "new_password": "123", "portal": "student"}, format="json")
        self.assertIn("new_password", weak.data)
        ok = self.client.post("/api/v1/auth/forgot-password/confirm/", {"email": "s1@f.com", "code": code, "new_password": "Brand-New-Pass-77", "portal": "student"}, format="json")
        self.assertEqual(ok.status_code, 200, ok.data)
        self.client.get("/api/v1/auth/csrf/")
        self.client.credentials(HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)
        from .testutils import login_payload
        login = self.client.post("/api/v1/auth/login/", login_payload("s1@f.com", "Brand-New-Pass-77"), format="json")
        self.assertEqual(login.status_code, 200)
        reuse = self.client.post("/api/v1/auth/forgot-password/confirm/", {"email": "s1@f.com", "code": code, "new_password": "Another-Pass-88", "portal": "student"}, format="json")
        self.assertEqual(reuse.status_code, 400)

    def test_unknown_email_and_wrong_portal_get_same_no_account_response(self):
        from django.core import mail
        a = self.reset_request(email="nobody@f.com", portal="student")
        b = self.reset_request(email="s1@f.com", portal="teacher")
        self.assertEqual(a.status_code, 400)
        self.assertEqual(a.data, b.data)
        self.assertIn("No account found for this sign-in", str(a.data))
        self.assertNotIn("teacher", str(a.data).lower())
        self.assertEqual(len(mail.outbox), 0)

    def test_wrong_portal_gets_generic_response_and_no_code(self):
        from django.core import mail
        res = self.reset_request(email="s1@f.com", portal="teacher")
        self.assertEqual(res.status_code, 400)
        self.assertIn("No account found for this sign-in", str(res.data))
        self.assertEqual(len(mail.outbox), 0)

    def test_wrong_code_attempts_limited(self):
        self.reset_request(email="s1@f.com", portal="student")
        code = self.code()
        bad = "000000" if code != "000000" else "111111"
        for _ in range(5):
            self.client.post("/api/v1/auth/forgot-password/confirm/", {"email": "s1@f.com", "code": bad, "new_password": "Brand-New-Pass-77", "portal": "student"}, format="json")
        res = self.client.post("/api/v1/auth/forgot-password/confirm/", {"email": "s1@f.com", "code": code, "new_password": "Brand-New-Pass-77", "portal": "student"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_resend_wait(self):
        from django.core import mail
        first = self.reset_request(email="s1@f.com", portal="student")
        second = self.reset_request(email="s1@f.com", portal="student")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data, second.data)
        self.assertEqual(len(mail.outbox), 1)
