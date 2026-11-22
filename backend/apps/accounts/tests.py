from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.roles import Role
from apps.schools.models import School
from apps.teachers.models import Teacher

User = get_user_model()


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
    """30 min idle + 12 ghante ki pakki seema."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        from apps.core.tests import make_school
        self.data = make_school("s")

    def login(self):
        self.client.get("/api/v1/auth/csrf/")
        res = self.client.post("/api/v1/auth/login/", {"email": "admin@s.com", "password": "Str0ng-Passw0rd!"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        return res

    def refresh(self):
        csrf = self.client.cookies["csrftoken"].value
        return self.client.post("/api/v1/auth/refresh/", HTTP_X_CSRFTOKEN=csrf)

    def test_login_returns_session_info_and_refresh_keeps_auth_time(self):
        res = self.login()
        self.assertEqual(res.data["session"]["idle_minutes"], 30)
        self.assertIn("expires_at", res.data["session"])
        r = self.refresh()
        self.assertEqual(r.status_code, 200, r.data)
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken(self.client.cookies["refresh_token"].value)
        self.assertTrue(token.get("auth_time"))

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
        from django.core import mail
        return mail.outbox[-1].subject.split()[0]

    def test_full_reset_flow(self):
        from django.core import mail
        res = self.client.post("/api/v1/auth/forgot-password/", {"email": "S1@f.com"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        code = self.code()
        weak = self.client.post("/api/v1/auth/forgot-password/confirm/", {"email": "s1@f.com", "code": code, "new_password": "123"}, format="json")
        self.assertIn("new_password", weak.data)
        ok = self.client.post("/api/v1/auth/forgot-password/confirm/", {"email": "s1@f.com", "code": code, "new_password": "Brand-New-Pass-77"}, format="json")
        self.assertEqual(ok.status_code, 200, ok.data)
        login = self.client.post("/api/v1/auth/login/", {"email": "s1@f.com", "password": "Brand-New-Pass-77"}, format="json")
        self.assertEqual(login.status_code, 200)
        reuse = self.client.post("/api/v1/auth/forgot-password/confirm/", {"email": "s1@f.com", "code": code, "new_password": "Another-Pass-88"}, format="json")
        self.assertEqual(reuse.status_code, 400)

    def test_unknown_email_says_no_account_and_no_mail(self):
        from django.core import mail
        a = self.client.post("/api/v1/auth/forgot-password/", {"email": "nobody@f.com", "portal": "student"}, format="json")
        self.assertEqual(a.status_code, 400)
        self.assertIn("No account found", str(a.data["email"]))
        self.assertEqual(len(mail.outbox), 0)

    def test_wrong_portal_role_is_refused(self):
        from django.core import mail
        res = self.client.post("/api/v1/auth/forgot-password/", {"email": "s1@f.com", "portal": "teacher"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("not registered as a teacher", str(res.data["email"]))
        self.assertEqual(len(mail.outbox), 0)
        ok = self.client.post("/api/v1/auth/forgot-password/", {"email": "s1@f.com", "portal": "student"}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_wrong_code_attempts_limited(self):
        self.client.post("/api/v1/auth/forgot-password/", {"email": "s1@f.com"}, format="json")
        code = self.code()
        bad = "000000" if code != "000000" else "111111"
        for _ in range(5):
            self.client.post("/api/v1/auth/forgot-password/confirm/", {"email": "s1@f.com", "code": bad, "new_password": "Brand-New-Pass-77"}, format="json")
        res = self.client.post("/api/v1/auth/forgot-password/confirm/", {"email": "s1@f.com", "code": code, "new_password": "Brand-New-Pass-77"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_resend_wait(self):
        self.client.post("/api/v1/auth/forgot-password/", {"email": "s1@f.com"}, format="json")
        self.assertEqual(self.client.post("/api/v1/auth/forgot-password/", {"email": "s1@f.com"}, format="json").status_code, 400)
