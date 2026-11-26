import io
import base64
import datetime
import hashlib
import hmac
import re
import tempfile
from decimal import Decimal
from unittest import mock

from cryptography.fernet import Fernet
from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from apps.core.roles import Role
from apps.core.tests import PW, User, make_school

from . import security
from .models import StreCaptcha, StreEmailLog, StreExam, StreRegistration, StreSubject
from .security import make_email_token

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
MEDIA = tempfile.mkdtemp()


def image(name="photo.png"):
    return SimpleUploadedFile(name, PNG, content_type="image/png")


@override_settings(MEDIA_ROOT=MEDIA, RAZORPAY_KEY_ID="", RAZORPAY_KEY_SECRET="", CASHFREE_APP_ID="", CASHFREE_SECRET_KEY="", CASHFREE_ENV="", CASHFREE_NOTIFY_URL="", STRE_PAYMENT_FORM_URL="", STRE_PAYMENT_MODE="", STRE_EMAIL_SYNC=True, STRE_UPI_ID="stre@upi", AADHAAR_ENCRYPTION_KEY=Fernet.generate_key().decode())
class StreBase(APITestCase):
    def setUp(self):
        cache.clear()
        today = timezone.localdate()
        self.exam = StreExam.objects.create(code="STRE26", exam_date=today + datetime.timedelta(days=30), last_date=today + datetime.timedelta(days=10), fee=200, venue="Main Hall", auto_admit_card=False)
        StreSubject.objects.create(name="Mathematics")
        self.stre_admin = User.objects.create_user(email="exam@stre.com", password=PW, role=Role.STRE_ADMIN)
        self.roll1 = f"{self.exam.exam_date:%y}000001"  # roll no: sirf number, registration no se alag

    def form(self, **overrides):
        data = {
            "first_name": "Riya", "last_name": "Verma", "email": "riya@example.com", "mobile": "9876543210",
            "father_name": "Mohan Verma", "class_level": "8", "school_name": "Kendriya Vidyalaya BHU", "address": "12 Lanka Road, Varanasi 221005",
            "subject": "Mathematics", "subject_interest": "Algebra",
            "interests": ["Game Development", "Chess"], "aim_of_life": "To become a scientist",
            "aadhaar_number": "123456789012", "photo": image(), "signature": image("sign.png"),
        }
        data.update(overrides)
        if "email_token" not in overrides:  # email OTP se verified hone ka saboot
            data["email_token"] = make_email_token(data["email"])
        return data

    def captcha(self):
        """Test captcha jiska jawab pata hai."""
        c = StreCaptcha.objects.create(answer_hash=security._hash("AC2EK"), expires_at=timezone.now() + datetime.timedelta(minutes=5))
        return {"captcha_id": str(c.pk), "captcha": "AC2EK"}

    def admit(self, token):
        c = self.captcha()
        return self.client.get(f"/api/v1/stre/admit-card/{token}/?captcha_id={c['captcha_id']}&captcha={c['captcha']}")

    def register(self, **overrides):
        return self.client.post("/api/v1/stre/register/", self.form(**overrides), format="multipart")


class StrePublicTests(StreBase):
    def test_public_info_and_registration_sends_email(self):
        info = self.client.get("/api/v1/stre/public/").data
        self.assertEqual(info["exam"]["code"], "STRE26")
        self.assertIn("Mathematics", info["subjects"])
        self.assertFalse(info["payment"]["online"])
        res = self.register()
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["registration_no"], "STRE26-000001")
        self.assertEqual(res.data["status"], "payment_pending")
        reg = StreRegistration.objects.get()
        self.assertEqual(reg.interests, ["Game Development", "Chess"])
        self.assertEqual(reg.aadhaar_last4, "9012")
        self.assertNotIn("123456789012", reg.aadhaar_encrypted)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("STRE26-000001", mail.outbox[0].subject)

    def test_registration_capitalizes_text_field_initials(self):
        response = self.register(
            first_name="riya",
            last_name="verma",
            father_name="mohan kumar",
            school_name="kendriya vidyalaya bhu",
            address="12 lanka road, varanasi 221005",
            subject="mathematics",
            subject_interest="algebra and physics",
            interests=["game development", "chess"],
            aim_of_life="to become a scientist",
        )
        self.assertEqual(response.status_code, 201, response.data)
        registration = StreRegistration.objects.get()
        self.assertEqual(registration.first_name, "Riya")
        self.assertEqual(registration.last_name, "Verma")
        self.assertEqual(registration.father_name, "Mohan Kumar")
        self.assertEqual(registration.school_name, "Kendriya Vidyalaya Bhu")
        self.assertEqual(registration.address, "12 Lanka Road, Varanasi 221005")
        self.assertEqual(registration.subject, "Mathematics")
        self.assertEqual(registration.subject_interest, "Algebra And Physics")
        self.assertEqual(registration.interests, ["Game Development", "Chess"])
        self.assertEqual(registration.aim_of_life, "To Become A Scientist")

    def test_public_info_payload_is_cached(self):
        from apps.stre.views import PublicInfoView

        with mock.patch(
            "apps.stre.views.PublicInfoView._cached_payload",
            wraps=PublicInfoView._cached_payload,
        ) as payload:
            self.client.get("/api/v1/stre/public/")
            self.client.get("/api/v1/stre/public/")
        payload.assert_called_once()

    def test_custom_subject_and_validation_errors(self):
        self.assertEqual(self.register(subject="Astronomy").status_code, 201)
        bad = self.register(email="x@example.com", mobile="12345", first_name="R2", aadhaar_number="123", interests=[], signature=SimpleUploadedFile("s.txt", b"hello"))
        self.assertEqual(bad.status_code, 400)
        for field in ("mobile", "first_name", "aadhaar_number", "interests", "signature"):
            self.assertIn(field, bad.data)

    def test_duplicate_email_or_mobile_blocked(self):
        self.register()
        self.assertIn("email", self.register(mobile="9123456789").data)
        self.assertIn("mobile", self.register(email="other@example.com").data)

    def test_closed_registration(self):
        self.exam.registration_open = False
        self.exam.save()
        self.assertEqual(self.register().status_code, 400)

    def test_free_exam_is_paid_immediately(self):
        self.exam.fee = 0
        self.exam.save()
        self.assertEqual(self.register().data["status"], "paid")  # free exam: paid registration, admit card manual

    def test_status_lookup_requires_matching_mobile(self):
        registration = self.register().data
        reg_no = registration["registration_no"]
        status = self.client.post("/api/v1/stre/status/", {"registration_no": reg_no, "mobile": "9876543210", **self.captcha()})
        self.assertEqual(status.status_code, 200)
        self.assertEqual(status.data, {
            "status": "payment_pending",
            "status_label": "Payment pending",
            "access_token": registration["access_token"],
            "registration_no": reg_no,
            "amount": Decimal("200.00"),
            "payment_reference": "",
            "payment_attempts": 0,
            "last_payment_status": "",
            "last_payment_error": "",
            "results_published": False,
        })
        token_status = self.client.get(f"/api/v1/stre/status/?token={registration['access_token']}")
        self.assertEqual(token_status.data, status.data)
        self.assertEqual(self.client.post("/api/v1/stre/status/", {"registration_no": reg_no, "mobile": "9000000000", **self.captcha()}).status_code, 400)


class StreFlowTests(StreBase):
    def test_upi_payment_verified_then_admit_card_emailed(self):
        data = self.register().data
        token = data["access_token"]
        self.assertEqual(self.client.post("/api/v1/stre/pay/manual/", {"token": token, "reference": "ab"}).status_code, 400)
        res = self.client.post("/api/v1/stre/pay/manual/", {"token": token, "reference": "UTR123456789"})
        self.assertEqual(res.data["status"], "payment_submitted")
        self.assertEqual(self.admit(token).status_code, 400)

        reg = StreRegistration.objects.get()
        self.client.force_authenticate(self.stre_admin)
        self.assertEqual(self.client.get("/api/v1/stre/admin/registrations/?status=payment_submitted").data["count"], 1)
        verified = self.client.post(f"/api/v1/stre/admin/registrations/{reg.id}/mark-paid/", {}).data
        self.assertEqual(verified["status"], "paid")
        self.assertFalse(any("admit card" in m.subject.lower() for m in mail.outbox))
        gen = self.client.post("/api/v1/stre/admin/registrations/generate-admit-cards/", {"exam": str(self.exam.id)})
        self.assertEqual(gen.data["issued"], 1)  # admit card sirf admin ke generate-admit-cards se banta hai, payment par nahi
        self.assertEqual(self.client.get(f"/api/v1/stre/admin/registrations/{reg.id}/file/photo/").status_code, 200)
        self.assertIn("123456789012", self.client.get(f"/api/v1/stre/admin/registrations/{reg.id}/").data["aadhaar_number"])
        csv = self.client.get("/api/v1/stre/admin/registrations/export/")
        self.assertIn("STRE26-000001", csv.content.decode("utf-8"))

        self.client.force_authenticate(None)
        card = self.admit(token)
        self.assertEqual(card.status_code, 200)
        self.assertEqual(card.data["roll_no"], self.roll1)
        self.assertEqual(self.client.get(f"/api/v1/stre/files/{token}/photo/").status_code, 200)
        self.assertTrue(self.client.get(f"/api/v1/stre/verify/{self.roll1}/").data["valid"])

    def test_registration_pdf_downloads_after_payment_not_before(self):
        registration = self.register().data
        token = registration["access_token"]

        # Payment pending: no PDF yet
        before = self.client.get(f"/api/v1/stre/registration/{token}/download/")
        self.assertEqual(before.status_code, 400)

        reg = StreRegistration.objects.get()
        self.client.force_authenticate(self.stre_admin)
        self.client.post(f"/api/v1/stre/admin/registrations/{reg.id}/mark-paid/", {})
        self.client.force_authenticate(None)

        after = self.client.get(f"/api/v1/stre/registration/{token}/download/")
        self.assertEqual(after.status_code, 200)
        self.assertEqual(after["Content-Type"], "application/pdf")
        self.assertIn("attachment;", after["Content-Disposition"])
        self.assertTrue(after.content.startswith(b"%PDF-"))

    def test_cannot_issue_admit_card_unpaid(self):
        self.register()
        reg = StreRegistration.objects.get()
        self.client.force_authenticate(self.stre_admin)
        self.assertEqual(self.client.post(f"/api/v1/stre/admin/registrations/{reg.id}/issue-admit-card/").status_code, 400)

    def test_issued_admit_card_downloads_pdf_directly_without_captcha(self):
        registration = self.register().data
        reg = StreRegistration.objects.get()
        self.client.force_authenticate(self.stre_admin)
        self.client.post(f"/api/v1/stre/admin/registrations/{reg.id}/mark-paid/", {})
        self.client.post(f"/api/v1/stre/admin/registrations/{reg.id}/issue-admit-card/", {"send": "false"})
        self.client.force_authenticate(None)

        response = self.client.get(f"/api/v1/stre/admit-card/{registration['access_token']}/download/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("attachment;", response["Content-Disposition"])
        self.assertTrue(response.content.startswith(b"%PDF-"))
        self.assertEqual(response["Cache-Control"], "no-store, private")  # NoStoreApiMiddleware sets this for every /api/v1/ response

    @override_settings(RAZORPAY_KEY_ID="rzp_test_x", RAZORPAY_KEY_SECRET="secret123")
    def test_razorpay_signature_verification(self):
        token = self.register().data["access_token"]
        with mock.patch("apps.stre.payments.create_order", return_value="order_ABC"):
            order = self.client.post("/api/v1/stre/pay/order/", {"token": token}).data
        self.assertEqual(order["order_id"], "order_ABC")
        self.assertEqual(order["amount"], 20000)
        bad = self.client.post("/api/v1/stre/pay/verify/", {"token": token, "razorpay_order_id": "order_ABC", "razorpay_payment_id": "pay_1", "razorpay_signature": "wrong"})
        self.assertEqual(bad.status_code, 400)
        sig = hmac.new(b"secret123", b"order_ABC|pay_1", hashlib.sha256).hexdigest()
        ok = self.client.post("/api/v1/stre/pay/verify/", {"token": token, "razorpay_order_id": "order_ABC", "razorpay_payment_id": "pay_1", "razorpay_signature": sig})
        self.assertEqual(ok.data["status"], "paid")


class StreAccessTests(StreBase):
    def test_school_staff_cannot_access_stre_admin(self):
        school = make_school("a")
        teacher_user = User.objects.create_user(email="t@a.com", password=PW, role=Role.TEACHER, school=school["school"])
        for user in (school["admin"], teacher_user):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get("/api/v1/stre/admin/registrations/").status_code, 403)
            self.assertEqual(self.client.get("/api/v1/stre/admin/dashboard/").status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/v1/stre/admin/registrations/").status_code, 401)

    def test_stre_admin_manages_exam_and_subjects_but_not_school_data(self):
        self.client.force_authenticate(self.stre_admin)
        self.assertEqual(self.client.post("/api/v1/stre/admin/subjects/", {"name": "Physics"}).status_code, 201)
        self.assertEqual(self.client.post("/api/v1/stre/admin/subjects/", {"name": "physics"}).status_code, 400)
        bad = self.client.post("/api/v1/stre/admin/exams/", {"code": "X1", "exam_date": "2026-01-01", "last_date": "2026-02-01"})
        self.assertIn("last_date", bad.data)
        self.assertEqual(self.client.get("/api/v1/stre/admin/dashboard/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/students/").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/auth/users/").status_code, 403)

    def test_stre_admin_can_log_in_without_school(self):
        self.client.get("/api/v1/auth/csrf/")
        self.client.credentials(HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)
        from apps.accounts.testutils import login_payload
        res = self.client.post("/api/v1/auth/login/", login_payload("exam@stre.com", PW), format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["user"]["role"], "stre_admin")


class StreExamDateTests(StreBase):
    def test_past_last_date_rejected_and_dashboard_explains(self):
        self.client.force_authenticate(self.stre_admin)
        today = timezone.localdate()
        past = self.client.post("/api/v1/stre/admin/exams/", {"code": "OLD1", "exam_date": (today - datetime.timedelta(days=1)).isoformat(), "last_date": (today - datetime.timedelta(days=2)).isoformat(), "fee": "10", "registration_open": True}, format="json")
        self.assertEqual(past.status_code, 400)
        self.assertIn("last_date", past.data)
        self.assertIn("exam_date", past.data)
        ok = self.client.post("/api/v1/stre/admin/exams/", {"code": "NEW1", "exam_date": (today + datetime.timedelta(days=20)).isoformat(), "last_date": today.isoformat(), "fee": "10", "registration_open": True}, format="json")
        self.assertEqual(ok.status_code, 201, ok.data)

    def test_closed_exam_reason_on_dashboard(self):
        StreExam.objects.filter(pk=self.exam.pk).update(last_date=timezone.localdate() - datetime.timedelta(days=1))
        self.client.force_authenticate(self.stre_admin)
        d = self.client.get("/api/v1/stre/admin/dashboard/").data
        self.assertIsNone(d["open_exam"])
        self.assertIn("has passed", d["closed_exams"][0]["reason"])
        res = self.client.patch(f"/api/v1/stre/admin/exams/{self.exam.id}/", {"last_date": (timezone.localdate() + datetime.timedelta(days=5)).isoformat()})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIsNotNone(self.client.get("/api/v1/stre/admin/dashboard/").data["open_exam"])


class StreEmailSettingsTests(StreBase):
    def test_email_status_and_test_mail(self):
        self.client.force_authenticate(self.stre_admin)
        status = self.client.get("/api/v1/stre/admin/email/").data
        self.assertIn("mode", status)
        res = self.client.post("/api/v1/stre/admin/email/", {"to": "someone@example.com"})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(mail.outbox[-1].to, ["someone@example.com"])
        self.assertEqual(self.client.post("/api/v1/stre/admin/email/", {"to": "bad"}).status_code, 400)

    def test_school_admin_cannot_use_email_tools(self):
        school = make_school("z")
        self.client.force_authenticate(school["admin"])
        self.assertEqual(self.client.get("/api/v1/stre/admin/email/").status_code, 403)


class StreAutoAdmitCardTests(StreBase):
    """Paid registrations ke liye admit card sirf manual issue/send."""

    def setUp(self):
        super().setUp()
        self.exam.auto_admit_card = True
        self.exam.save()

    def test_admin_verifies_upi_and_admit_card_is_emailed(self):
        token = self.register().data["access_token"]
        self.assertIn("not confirmed yet", mail.outbox[-1].subject.lower())  # bina payment confirm nahi
        self.client.post("/api/v1/stre/pay/manual/", {"token": token, "reference": "UTR999888777"})
        reg = StreRegistration.objects.get()
        mail.outbox.clear()
        self.client.force_authenticate(self.stre_admin)
        res = self.client.post(f"/api/v1/stre/admin/registrations/{reg.id}/mark-paid/", {})
        self.assertEqual(res.data["status"], "paid")
        self.assertEqual(res.data["roll_no"], self.roll1)
        subjects = [m.subject for m in mail.outbox]
        self.assertTrue(any("payment confirmed" in s.lower() for s in subjects), subjects)
        reg.refresh_from_db()
        self.assertIsNone(reg.admit_card_sent_at)

    def test_free_exam_gets_admit_card_on_registration(self):
        self.exam.fee = 0
        self.exam.save()
        res = self.register()
        self.assertEqual(res.data["status"], "paid")
        self.assertTrue(res.data["roll_no"])
        self.assertFalse(any("admit card" in m.subject.lower() for m in mail.outbox))

    @override_settings(RAZORPAY_KEY_ID="rzp_test_x", RAZORPAY_KEY_SECRET="secret123")
    def test_online_payment_auto_admit_card(self):
        token = self.register().data["access_token"]
        with mock.patch("apps.stre.payments.create_order", return_value="order_Z"):
            self.client.post("/api/v1/stre/pay/order/", {"token": token})
        sig = hmac.new(b"secret123", b"order_Z|pay_9", hashlib.sha256).hexdigest()
        mail.outbox.clear()
        payload = {"token": token, "razorpay_order_id": "order_Z", "razorpay_payment_id": "pay_9", "razorpay_signature": sig}
        res = self.client.post("/api/v1/stre/pay/verify/", payload)
        self.assertEqual(res.data["status"], "paid")
        self.assertTrue(res.data["roll_no"])
        duplicate = self.client.post("/api/v1/stre/pay/verify/", payload)
        self.assertEqual(duplicate.data["status"], "paid")
        self.assertEqual(sum("payment confirmed" in message.subject.lower() for message in mail.outbox), 1)
        registration = StreRegistration.objects.get()
        self.assertEqual(StreEmailLog.objects.filter(registration=registration, kind=StreEmailLog.Kind.PAYMENT).count(), 1)


@override_settings(CASHFREE_APP_ID="cf_app", CASHFREE_SECRET_KEY="cfsk_ma_test_secret", CASHFREE_ENV="sandbox")
class StreCashfreeTests(StreBase):
    def start(self):
        token = self.register().data["access_token"]
        with mock.patch("apps.stre.payments.create_cashfree_order", return_value=("STRE26000001_1", "session_abc")) as create:
            order = self.client.post("/api/v1/stre/pay/order/", {"token": token}).data
        return token, order, create

    def test_public_info_shows_cashfree(self):
        info = self.client.get("/api/v1/stre/public/").data["payment"]
        self.assertEqual(info["provider"], "cashfree")
        self.assertEqual(info["cashfree_mode"], "sandbox")

    def test_order_then_verify_paid(self):
        token, order, create = self.start()
        self.assertEqual(order["provider"], "cashfree")
        self.assertEqual(order["payment_session_id"], "session_abc")
        self.assertIn("cf_order={order_id}", create.call_args.kwargs["return_url"])
        with mock.patch("apps.stre.payments.fetch_cashfree_payment", return_value=("ACTIVE", "", 200.0)):
            self.assertEqual(self.client.post("/api/v1/stre/pay/verify/", {"token": token, "cf_order_id": "STRE26000001_1"}).status_code, 400)
        mail.outbox.clear()
        with mock.patch("apps.stre.payments.fetch_cashfree_payment", return_value=("PAID", "987654", 200.0)):
            res = self.client.post("/api/v1/stre/pay/verify/", {"token": token, "cf_order_id": "STRE26000001_1"})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["status"], "paid")
        self.assertEqual(res.data["payment_method"], "cashfree")
        roll = res.data["roll_no"]
        self.assertRegex(roll, r"^\d{8}$")  # payment hote hi roll number
        self.assertTrue(any(roll in m.body for m in mail.outbox))  # confirmation mail me roll no
        self.assertTrue(any("payment confirmed" in m.subject.lower() for m in mail.outbox))
        duplicate = self.client.post("/api/v1/stre/pay/verify/", {"token": token, "cf_order_id": "STRE26000001_1"})
        self.assertEqual(duplicate.data["status"], "paid")
        self.assertEqual(sum("payment confirmed" in message.subject.lower() for message in mail.outbox), 1)

    def test_wrong_order_or_short_amount_rejected(self):
        token, _, _ = self.start()
        with mock.patch("apps.stre.payments.fetch_cashfree_payment", return_value=("PAID", "1", 200.0)):
            self.assertEqual(self.client.post("/api/v1/stre/pay/verify/", {"token": token, "cf_order_id": "OTHER_ORDER"}).status_code, 400)
        with mock.patch("apps.stre.payments.fetch_cashfree_payment", return_value=("PAID", "1", 1.0)):
            self.assertEqual(self.client.post("/api/v1/stre/pay/verify/", {"token": token, "cf_order_id": "STRE26000001_1"}).status_code, 400)
        self.assertEqual(StreRegistration.objects.get().status, "payment_pending")

    def test_webhook_signature(self):
        token, _, _ = self.start()
        import json as _json
        body = _json.dumps({"type": "PAYMENT_SUCCESS_WEBHOOK", "data": {"order": {"order_id": "STRE26000001_1"}}}).encode()
        bad = self.client.post("/api/v1/stre/pay/cashfree-webhook/", body, content_type="application/json", HTTP_X_WEBHOOK_TIMESTAMP="1", HTTP_X_WEBHOOK_SIGNATURE="nope")
        self.assertEqual(bad.status_code, 400)
        sig = base64.b64encode(hmac.new(b"cfsk_ma_test_secret", b"1" + body, hashlib.sha256).digest()).decode()
        with mock.patch("apps.stre.payments.fetch_cashfree_payment", return_value=("PAID", "555", 200.0)):
            ok = self.client.post("/api/v1/stre/pay/cashfree-webhook/", body, content_type="application/json", HTTP_X_WEBHOOK_TIMESTAMP="1", HTTP_X_WEBHOOK_SIGNATURE=sig)
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(StreRegistration.objects.get().status, "paid")


    def test_paid_on_cashfree_is_picked_up_without_browser_callback(self):
        """UPI app / browser band: verify call nahi aayi, phir bhi status page / admin sync se confirm."""
        from django.core.cache import cache as _cache
        token, _, _ = self.start()
        _cache.clear()
        with mock.patch("apps.stre.payments.fetch_cashfree_payment", return_value=("PAID", "777", 200.0)):
            res = self.client.get(f"/api/v1/stre/status/?token={token}")
        self.assertEqual(res.data["status"], "paid")
        self.assertEqual(StreRegistration.objects.get().gateway_payment_id, "777")

    def test_admin_check_and_sync_payments(self):
        token, _, _ = self.start()
        reg = StreRegistration.objects.get()
        self.client.force_authenticate(self.stre_admin)
        with mock.patch("apps.stre.payments.fetch_cashfree_payment", return_value=("ACTIVE", "", 200.0)):
            self.assertEqual(self.client.post(f"/api/v1/stre/admin/registrations/{reg.pk}/check-payment/").status_code, 400)
        with mock.patch("apps.stre.payments.fetch_cashfree_payment", return_value=("PAID", "888", 200.0)):
            res = self.client.post("/api/v1/stre/admin/registrations/sync-payments/")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["confirmed"], [reg.registration_no])
        reg.refresh_from_db()
        self.assertEqual(reg.status, "paid")

    @override_settings(STRE_PAYMENT_FORM_URL="https://payments.cashfree.com/forms?code=oshitech-stre")
    def test_payment_link_only_hides_online_checkout(self):
        info = self.client.get("/api/v1/stre/public/").data["payment"]
        self.assertFalse(info["online"])
        self.assertTrue(info["form_url"])
        token = self.register().data["access_token"]
        self.assertEqual(self.client.post("/api/v1/stre/pay/order/", {"token": token}).status_code, 400)
        with override_settings(STRE_PAYMENT_MODE="both"):
            self.assertTrue(self.client.get("/api/v1/stre/public/").data["payment"]["online"])

    @override_settings(STRE_PAYMENT_FORM_URL="https://payments.cashfree.com/forms?code=oshitech-stre", STRE_PAYMENT_MODE="online")
    def test_online_mode_is_fully_automatic(self):
        """Sirf online checkout: link / UPI / manual Payment ID band; pending payment kisi ke click ke bina confirm."""
        from django.core.cache import cache as _cache
        info = self.client.get("/api/v1/stre/public/").data["payment"]
        self.assertTrue(info["online"])
        self.assertEqual((info["form_url"], info["upi_id"]), ("", ""))
        token, _, _ = self.start()
        self.assertEqual(self.client.post("/api/v1/stre/pay/manual/", {"token": token, "reference": "5114919280"}).status_code, 400)
        _cache.clear()
        with mock.patch("apps.stre.payments.fetch_cashfree_payment", return_value=("PAID", "4242", 200.0)):
            self.client.get("/api/v1/stre/public/")  # koi bhi visitor -> background sync
        self.assertEqual(StreRegistration.objects.get().status, "paid")

class StrePaymentLinkTests(StreBase):
    @override_settings(STRE_PAYMENT_FORM_URL="https://payments.cashfree.com/forms?code=oshitech-stre")
    def test_payment_link_shown_and_payment_id_verified_by_admin(self):
        info = self.client.get("/api/v1/stre/public/").data["payment"]
        self.assertEqual(info["form_url"], "https://payments.cashfree.com/forms?code=oshitech-stre")
        token = self.register().data["access_token"]
        res = self.client.post("/api/v1/stre/pay/manual/", {"token": token, "reference": "5114919280"})
        self.assertEqual(res.data["status"], "payment_submitted")
        self.assertEqual(res.data["payment_method"], "manual")
        reg = StreRegistration.objects.get()
        self.client.force_authenticate(self.stre_admin)
        self.assertEqual(self.client.post(f"/api/v1/stre/admin/registrations/{reg.id}/mark-paid/", {}).data["status"], "paid")

    @override_settings(STRE_PAYMENT_FORM_URL="http://insecure.example/form")
    def test_non_https_link_hidden(self):
        self.assertEqual(self.client.get("/api/v1/stre/public/").data["payment"]["form_url"], "")


class StreBulkEmailAndPaymentFailureTests(StreBase):
    def paid_regs(self, n):
        regs = []
        for i in range(n):
            self.register(email=f"c{i}@example.com", mobile=f"98765432{i:02d}")
        for reg in StreRegistration.objects.all():
            reg.mark_paid("manual", f"UTR{reg.pk.hex[:8]}")
            regs.append(reg)
        return regs

    def test_roll_number_differs_from_registration_number(self):
        reg = self.paid_regs(1)[0]
        self.client.force_authenticate(self.stre_admin)
        res = self.client.post(f"/api/v1/stre/admin/registrations/{reg.id}/issue-admit-card/", {"send": "false"})
        self.assertTrue(res.data["roll_no"].isdigit())
        self.assertNotEqual(res.data["roll_no"], res.data["registration_no"])
        self.assertTrue(res.data["registration_no"].startswith("STRE26-"))

    def test_one_click_admit_cards_to_all_and_failed_resend(self):
        self.paid_regs(3)
        self.client.force_authenticate(self.stre_admin)
        mail.outbox.clear()
        with mock.patch("apps.stre.emails._send", side_effect=[(True, ""), (False, "SMTP timeout"), (True, "")]):
            res = self.client.post("/api/v1/stre/admin/bulk-email/", {"exam": str(self.exam.id), "kind": "admit_card"})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["issued"], 3)
        self.assertEqual(res.data["queued"], 3)
        summary = self.client.get(f"/api/v1/stre/admin/email-logs/summary/?batch={res.data['batch']}").data
        self.assertEqual((summary["sent"], summary["failed"]), (2, 1))
        failed = self.client.get("/api/v1/stre/admin/email-logs/?status=failed").data["results"]
        self.assertEqual(failed[0]["error"], "SMTP timeout")
        self.assertEqual(self.client.get("/api/v1/stre/admin/registrations/stats/").data["email_failed"], 1)
        resent = self.client.post(f"/api/v1/stre/admin/email-logs/{failed[0]['id']}/resend/")
        self.assertEqual(resent.status_code, 200, resent.data)
        self.assertEqual(self.client.get("/api/v1/stre/admin/email-logs/?status=failed").data["count"], 0)

    def test_announcement_to_everyone(self):
        self.paid_regs(2)
        self.client.force_authenticate(self.stre_admin)
        mail.outbox.clear()
        bad = self.client.post("/api/v1/stre/admin/bulk-email/", {"exam": str(self.exam.id), "kind": "announcement", "subject": "", "message": ""})
        self.assertEqual(bad.status_code, 400)
        res = self.client.post("/api/v1/stre/admin/bulk-email/", {"exam": str(self.exam.id), "kind": "announcement", "subject": "Exam centre changed", "message": "The exam will be held in Hall B.\nReach by 9 AM."})
        self.assertEqual(res.data["queued"], 2)
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(mail.outbox[0].subject, "Oshitech STRE | Exam centre changed")
        self.assertIn("Hall B", mail.outbox[0].alternatives[0][0])

    def test_resend_failed_all(self):
        self.paid_regs(2)
        self.client.force_authenticate(self.stre_admin)
        with mock.patch("apps.stre.emails._send", return_value=(False, "Auth error")):
            self.client.post("/api/v1/stre/admin/bulk-email/", {"exam": str(self.exam.id), "kind": "admit_card"})
        self.assertEqual(self.client.get("/api/v1/stre/admin/email-logs/summary/?status=failed").data["total"], 2)
        res = self.client.post("/api/v1/stre/admin/email-logs/resend-failed/", {"exam": str(self.exam.id)})
        self.assertEqual(res.data["queued"], 2)
        self.assertEqual(self.client.get("/api/v1/stre/admin/email-logs/summary/").data["failed"], 0)

    def test_payment_failure_recorded_and_retry_possible(self):
        token = self.register().data["access_token"]
        res = self.client.post("/api/v1/stre/pay/failed/", {"token": token, "reason": "Payment failed at bank"})
        self.assertEqual(res.data["last_payment_status"], "failed")
        self.assertEqual(res.data["status"], "payment_pending")
        self.client.force_authenticate(self.stre_admin)
        self.assertEqual(self.client.get("/api/v1/stre/admin/registrations/?payment_issue=failed").data["count"], 1)
        self.assertEqual(self.client.get("/api/v1/stre/admin/registrations/stats/").data["payment_failed"], 1)

    def test_school_admin_cannot_bulk_email(self):
        school = make_school("q")
        self.client.force_authenticate(school["admin"])
        self.assertEqual(self.client.post("/api/v1/stre/admin/bulk-email/", {"exam": str(self.exam.id), "kind": "admit_card"}).status_code, 403)


class StreCeleryTaskTests(StreBase):
    def test_bulk_email_is_queued_outside_sync_mode(self):
        self.register()
        reg = StreRegistration.objects.get(email="riya@example.com")
        entry = StreEmailLog.objects.create(
            registration=reg, kind=StreEmailLog.Kind.ANNOUNCEMENT,
            to_email="riya@example.com",
        )
        with override_settings(STRE_EMAIL_SYNC=False), mock.patch(
            "apps.stre.tasks.process_stre_email_logs.delay"
        ) as enqueue:
            from apps.stre.views import run_email_job

            run_email_job([entry.pk])
        enqueue.assert_called_once_with([str(entry.pk)])
        entry.refresh_from_db()
        self.assertEqual(entry.status, StreEmailLog.Status.QUEUED)

    def test_email_task_processes_in_background_mode(self):
        from apps.stre.tasks import process_stre_email_logs

        with mock.patch("apps.stre.views._process_email_logs") as process:
            process_stre_email_logs.run(["email-log-id"])
        process.assert_called_once_with(["email-log-id"], background=True)

    def test_bulk_email_queue_failure_marks_logs_failed(self):
        self.register()
        reg = StreRegistration.objects.get(email="riya@example.com")
        entry = StreEmailLog.objects.create(
            registration=reg, kind=StreEmailLog.Kind.ANNOUNCEMENT,
            to_email="riya@example.com",
        )
        from apps.stre.views import run_email_job

        with override_settings(STRE_EMAIL_SYNC=False), mock.patch(
            "apps.stre.tasks.process_stre_email_logs.delay", side_effect=ConnectionError("Redis offline")
        ), self.assertRaises(ValidationError):
            run_email_job([entry.pk])
        entry.refresh_from_db()
        self.assertEqual(entry.status, StreEmailLog.Status.FAILED)
        self.assertIn("Redis offline", entry.error)

    def test_payment_task_runs_guarded_background_worker(self):
        from apps.stre import tasks

        with mock.patch("apps.stre.tasks.payments.cashfree_enabled", return_value=True), mock.patch(
            "apps.stre.views._auto_sync_worker"
        ) as worker:
            tasks.sync_stre_payments.run()
        worker.assert_called_once_with(background=True)
        self.assertIsNone(cache.get("stre-auto-sync"))


class StreAdminEditTests(StreBase):
    def test_admin_corrects_details(self):
        self.register()
        reg = StreRegistration.objects.get()
        self.client.force_authenticate(self.stre_admin)
        res = self.client.patch(f"/api/v1/stre/admin/registrations/{reg.id}/", {"first_name": "Riyaa", "mobile": "+91 91234 56780", "father_name": "Mohan Lal Verma", "interests": ["Robotics"]}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(sorted(res.data["changed_fields"]), ["father_name", "first_name", "interests", "mobile"])
        reg.refresh_from_db()
        self.assertEqual((reg.first_name, reg.mobile, reg.interests), ("Riyaa", "9123456780", ["Robotics"]))
        from apps.core.models import AuditLog
        self.assertTrue(AuditLog.objects.filter(action="stre_registration_edited").exists())

    def test_validation_and_duplicates(self):
        self.register()
        self.register(email="other@example.com", mobile="9123456789")
        reg = StreRegistration.objects.get(email="riya@example.com")
        self.client.force_authenticate(self.stre_admin)
        bad = self.client.patch(f"/api/v1/stre/admin/registrations/{reg.id}/", {"first_name": "R2", "mobile": "123"}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertIn("first_name", bad.data)
        self.assertIn("mobile", bad.data)
        dup = self.client.patch(f"/api/v1/stre/admin/registrations/{reg.id}/", {"email": "other@example.com"}, format="json")
        self.assertIn("email", dup.data)

    def test_photo_aadhaar_update_and_admit_card_resend(self):
        self.register()
        reg = StreRegistration.objects.get()
        reg.mark_paid("manual", "UTR11223344")
        self.client.force_authenticate(self.stre_admin)
        self.client.post(f"/api/v1/stre/admin/registrations/{reg.id}/issue-admit-card/", {"send": "false"})
        mail.outbox.clear()
        res = self.client.patch(f"/api/v1/stre/admin/registrations/{reg.id}/", {"last_name": "Sharma", "aadhaar_number": "999988887777", "photo": image("new.png"), "resend_admit_card": "true"}, format="multipart")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data["admit_card_resent"])
        self.assertEqual(len(mail.outbox), 1)
        reg.refresh_from_db()
        self.assertEqual((reg.last_name, reg.aadhaar_last4), ("Sharma", "7777"))
        self.assertIn("Sharma", self.admit(reg.access_token).data["full_name"])

    def test_others_cannot_edit(self):
        self.register()
        reg = StreRegistration.objects.get()
        school = make_school("e")
        self.client.force_authenticate(school["admin"])
        self.assertEqual(self.client.patch(f"/api/v1/stre/admin/registrations/{reg.id}/", {"first_name": "Hack"}, format="json").status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.patch(f"/api/v1/stre/admin/registrations/{reg.id}/", {"first_name": "Hack"}, format="json").status_code, 401)


class StreSupportNoticeDeleteTests(StreBase):
    def test_candidate_raises_support_and_admin_replies(self):
        reg_no = self.register().data["registration_no"]
        mail.outbox.clear()
        bad = self.client.post("/api/v1/stre/support/", {"name": "R", "email": "x", "mobile": "12", "category": "correction", "subject": "a", "message": "short"})
        self.assertEqual(bad.status_code, 400)
        for f in ("name", "email", "mobile", "subject", "message"):
            self.assertIn(f, bad.data)
        res = self.client.post("/api/v1/stre/support/", {"name": "Riya Verma", "email": "riya@example.com", "mobile": "9876543210", "registration_no": reg_no.lower(), "category": "correction", "subject": "Wrong father name", "message": "My father's name is spelled wrong, please correct it."})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data["ticket_no"].startswith("STRE-T"))
        self.assertIn("received", mail.outbox[-1].subject)
        self.client.force_authenticate(self.stre_admin)
        tickets = self.client.get("/api/v1/stre/admin/support/?status=open").data
        self.assertEqual(tickets["count"], 1)
        t = tickets["results"][0]
        self.assertEqual(t["linked_candidate"], "Riya Verma")
        mail.outbox.clear()
        upd = self.client.patch(f"/api/v1/stre/admin/support/{t['id']}/", {"status": "resolved", "admin_reply": "Corrected. Please check your status page."}, format="json")
        self.assertEqual(upd.status_code, 200, upd.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(t["ticket_no"], mail.outbox[0].subject)
        self.assertEqual(self.client.get("/api/v1/stre/admin/support/counts/").data["resolved"], 1)

    def test_notices_public_and_admin_only(self):
        self.client.force_authenticate(self.stre_admin)
        self.assertEqual(self.client.post("/api/v1/stre/admin/notices/", {"title": "Admit cards from 10 Dec", "body": "Check email."}, format="json").status_code, 201)
        self.client.post("/api/v1/stre/admin/notices/", {"title": "Hidden", "is_active": False}, format="json")
        self.client.force_authenticate(None)
        titles = [n["title"] for n in self.client.get("/api/v1/stre/notices/").data]
        self.assertEqual(titles, ["Admit cards from 10 Dec"])
        self.assertEqual(self.client.get("/api/v1/public-notices/").data["stre_notices"][0]["title"], "Admit cards from 10 Dec")
        school = make_school("n")
        self.client.force_authenticate(school["admin"])
        self.assertEqual(self.client.post("/api/v1/stre/admin/notices/", {"title": "x"}, format="json").status_code, 403)

    def test_notice_pdf_public_while_active(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.client.force_authenticate(self.stre_admin)
        pdf = SimpleUploadedFile("syllabus.pdf", b"%PDF-1.4 test", content_type="application/pdf")
        res = self.client.post("/api/v1/stre/admin/notices/", {"title": "Syllabus", "attachment": pdf}, format="multipart")
        self.assertEqual(res.status_code, 201, res.data)
        url = res.data["attachment_url"]
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/v1/stre/notices/").data[0]["attachment_url"], url)
        self.assertEqual(self.client.get("/api/v1/public-notices/").data["stre_notices"][0]["attachment_url"], url)
        self.assertEqual(self.client.get(url).status_code, 200)
        self.client.force_authenticate(self.stre_admin)
        self.client.patch(f"/api/v1/stre/admin/notices/{res.data['id']}/", {"is_active": False}, format="json")
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_admin_deletes_registration(self):
        self.register()
        reg = StreRegistration.objects.get()
        self.client.force_authenticate(self.stre_admin)
        self.assertEqual(self.client.delete(f"/api/v1/stre/admin/registrations/{reg.id}/").status_code, 204)
        self.assertFalse(StreRegistration.objects.exists())
        from apps.core.models import AuditLog
        self.assertTrue(AuditLog.objects.filter(action="stre_registration_deleted").exists())
        school = make_school("d")
        self.register()
        self.client.force_authenticate(school["admin"])
        self.assertEqual(self.client.delete(f"/api/v1/stre/admin/registrations/{StreRegistration.objects.get().id}/").status_code, 403)


class StreOtpCaptchaTests(StreBase):
    def test_registration_needs_verified_email(self):
        self.assertIn("email", self.register(email_token="").data)
        other = make_email_token("someone.else@example.com")
        self.assertIn("email", self.register(email_token=other).data)

    def test_otp_flow(self):
        mail.outbox.clear()
        res = self.client.post("/api/v1/stre/otp/send/", {"email": "Riya@Example.com"})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(len(mail.outbox), 1)
        code_match = re.search(r"\b(\d{6})\b", mail.outbox[0].subject)
        self.assertIsNotNone(code_match)
        code = code_match.group(1)
        # turant dobara nahi
        self.assertEqual(self.client.post("/api/v1/stre/otp/send/", {"email": "riya@example.com"}).status_code, 400)
        wrong = self.client.post("/api/v1/stre/otp/verify/", {"email": "riya@example.com", "code": "000000" if code != "000000" else "111111"})
        self.assertIn("attempt", str(wrong.data["code"]))
        ok = self.client.post("/api/v1/stre/otp/verify/", {"email": "riya@example.com", "code": code})
        self.assertEqual(ok.status_code, 200, ok.data)
        res = self.register(email_token=ok.data["email_token"])
        self.assertEqual(res.status_code, 201, res.data)
        # registered email par dobara OTP nahi
        self.assertEqual(self.client.post("/api/v1/stre/otp/send/", {"email": "riya@example.com"}).status_code, 400)

    def test_otp_send_has_its_own_tight_throttle(self):
        """OTP-send gets its own scope (stre_otp_send, 5/hour) separate from the general
        `stre` scope (150/hour) — a bot spraying OTP requests across many emails must not
        be able to use the generous general budget to email-bomb."""
        for i in range(5):
            res = self.client.post("/api/v1/stre/otp/send/", {"email": f"flood{i}@example.com"})
            self.assertEqual(res.status_code, 200, res.data)
        res = self.client.post("/api/v1/stre/otp/send/", {"email": "flood5@example.com"})
        self.assertEqual(res.status_code, 429, res.data)

    def test_too_many_wrong_otp(self):
        self.client.post("/api/v1/stre/otp/send/", {"email": "x@example.com"})
        code = re.search(r"\b(\d{6})\b", mail.outbox[-1].subject).group(1)
        bad = "000000" if code != "000000" else "111111"
        for _ in range(5):
            self.client.post("/api/v1/stre/otp/verify/", {"email": "x@example.com", "code": bad})
        self.assertEqual(self.client.post("/api/v1/stre/otp/verify/", {"email": "x@example.com", "code": code}).status_code, 400)

    def test_captcha_required_and_single_use(self):
        reg_no = self.register().data["registration_no"]
        res = self.client.get("/api/v1/stre/captcha/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["svg"].startswith("<svg"))
        self.assertNotIn("<text", res.data["svg"])
        body = {"registration_no": reg_no, "mobile": "9876543210"}
        self.assertIn("captcha", self.client.post("/api/v1/stre/status/", body).data)
        c = self.captcha()
        self.assertIn("captcha", self.client.post("/api/v1/stre/status/", {**body, "captcha_id": c["captcha_id"], "captcha": "WRONG"}).data)
        # wahi captcha dobara nahi chalta
        self.assertIn("captcha", self.client.post("/api/v1/stre/status/", {**body, **c}).data)
        self.assertEqual(self.client.post("/api/v1/stre/status/", {**body, **self.captcha()}).status_code, 200)

    def test_admit_card_email_has_ticket_and_photo(self):
        self.register()
        reg = StreRegistration.objects.get()
        reg.mark_paid("manual", "UTR55667788")
        self.client.force_authenticate(self.stre_admin)
        mail.outbox.clear()
        self.client.post(f"/api/v1/stre/admin/registrations/{reg.id}/issue-admit-card/", {"send": "true"})
        msg = mail.outbox[-1]
        html = msg.alternatives[0][0]
        self.assertIn("cid:candidate-photo", html)
        self.assertIn("Roll number", html)
        self.assertTrue(any(getattr(a, "get", lambda *_: None)("Content-ID") == "<candidate-photo>" for a in msg.attachments))


class StreSchoolAddressTests(StreBase):
    def test_school_and_address_required_and_saved(self):
        bad = self.register(school_name="", address="Varanasi")
        self.assertEqual(bad.status_code, 400)
        self.assertIn("school_name", bad.data)
        self.assertIn("address", bad.data)
        ok = self.register()
        self.assertEqual(ok.status_code, 201, ok.data)
        reg = StreRegistration.objects.get()
        self.assertEqual(reg.school_name, "Kendriya Vidyalaya BHU")
        self.client.force_authenticate(self.stre_admin)
        detail = self.client.get(f"/api/v1/stre/admin/registrations/{reg.id}/").data
        self.assertEqual(detail["address"], "12 Lanka Road, Varanasi 221005")
        res = self.client.patch(f"/api/v1/stre/admin/registrations/{reg.id}/", {"school_name": "DPS Varanasi"}, format="json")
        self.assertEqual(res.data["school_name"], "DPS Varanasi")
        self.assertNotIn("DPS Varanasi", self.client.get("/api/v1/stre/admin/registrations/export/").content.decode("utf-8"))  # unpaid: confirm nahi
        self.assertIn("DPS Varanasi", self.client.get("/api/v1/stre/admin/registrations/export/?status=payment_pending").content.decode("utf-8"))



class StreUnpaidHiddenTests(StreBase):
    def test_unpaid_registration_not_in_admin_list_until_paid(self):
        self.register()
        self.client.force_authenticate(self.stre_admin)
        self.assertEqual(self.client.get("/api/v1/stre/admin/registrations/").data["count"], 0)
        stats = self.client.get("/api/v1/stre/admin/registrations/stats/").data
        self.assertEqual((stats["total"], stats["by_status"]["payment_pending"]), (0, 1))
        self.assertEqual(self.client.get("/api/v1/stre/admin/registrations/?status=payment_pending").data["count"], 1)
        self.assertEqual(self.client.get("/api/v1/stre/admin/dashboard/").data["registrations"], 0)

class StreClassLevelTests(StreBase):
    def test_class_required_and_shown(self):
        self.assertIn("class_level", self.register(class_level="").data)
        self.assertIn("class_level", self.register(class_level="13").data)
        self.register()
        reg = StreRegistration.objects.get()
        self.assertEqual(reg.class_level, "8")
        reg.mark_paid("manual", "UTR99001122")
        self.client.force_authenticate(self.stre_admin)
        mail.outbox.clear()
        self.client.post(f"/api/v1/stre/admin/registrations/{reg.id}/issue-admit-card/", {"send": "true"})
        self.assertIn("Class 8", mail.outbox[-1].alternatives[0][0])
        self.client.force_authenticate(None)
        self.assertEqual(self.admit(reg.access_token).data["class_level"], "8")


class StreStuckPaidTests(StreBase):
    def test_paid_without_admit_card_gets_roll_no_but_no_auto_admit_card(self):
        """Stuck/closed 'paid' registrations get a roll number from the sync worker, but the
        admit card itself is never auto-issued — only an admin's explicit action issues it."""
        from apps.stre.views import _auto_sync_worker
        self.register()
        reg = StreRegistration.objects.get()
        StreRegistration.objects.filter(pk=reg.pk).update(status="paid", payment_method="cashfree", payment_reference="7056569957")
        mail.outbox.clear()
        _auto_sync_worker()
        reg.refresh_from_db()
        self.assertEqual(reg.status, "paid")
        self.assertTrue(reg.roll_no)
        self.assertFalse(any("admit card" in m.subject.lower() for m in mail.outbox))

class StreResultTests(StreBase):
    def setUp(self):
        super().setUp()
        self.exam.fee = 0  # free exam: registration par hi roll no; admit card manual
        self.exam.save()
        people = [("Riya", "riya@example.com", "9876543210"), ("Aman", "aman@example.com", "9876543211"),
                  ("Neha", "neha@example.com", "9876543212"), ("Kabir", "kabir@example.com", "9876543213")]
        for first, email, mobile in people:
            res = self.register(first_name=first, email=email, mobile=mobile)
            self.assertEqual(res.data["status"], "paid", res.data)
        self.client.force_authenticate(self.stre_admin)
        gen = self.client.post("/api/v1/stre/admin/registrations/generate-admit-cards/", {"exam": str(self.exam.id), "send": "false"})
        self.assertEqual(gen.data["issued"], 4, gen.data)  # results sirf admit-card-issued candidates ke liye bante hain
        self.regs = list(StreRegistration.objects.order_by("roll_no"))

    def test_marks_rank_publish_result_and_certificate(self):
        r = [x.roll_no for x in self.regs]
        bad = self.client.post("/api/v1/stre/admin/results/save/", {"exam": str(self.exam.id), "rows": [{"roll_no": r[0], "marks": "150"}, {"roll_no": "99999999", "marks": "10"}]}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(len(bad.data["errors"]), 2)
        rows = [{"roll_no": r[0], "marks": "90"}, {"roll_no": r[1], "marks": "95.5"}, {"roll_no": r[2], "marks": "90"}, {"roll_no": r[3], "marks": "AB"}]
        ok = self.client.post("/api/v1/stre/admin/results/save/", {"exam": str(self.exam.id), "rows": rows}, format="json")
        self.assertEqual(ok.status_code, 200, ok.data)
        listing = {x["roll_no"]: x for x in self.client.get(f"/api/v1/stre/admin/results/?exam={self.exam.id}").data["rows"]}
        self.assertEqual([listing[x]["rank"] for x in r], [2, 1, 2, None])  # tie -> same rank
        self.assertTrue(listing[r[3]]["is_absent"])
        # publish se pehle candidate ko result nahi
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/v1/stre/result/?token={self.regs[1].access_token}").status_code, 400)
        self.assertFalse(self.client.get("/api/v1/stre/public/").data["results_published"])  # OFF: website par Result nahi
        self.assertIsNone(self.client.get("/api/v1/public-notices/").data["stre_result"])
        self.client.force_authenticate(self.stre_admin)
        mail.outbox.clear()
        pub = self.client.post("/api/v1/stre/admin/results/publish/", {"exam": str(self.exam.id), "publish": True, "email": True}, format="json")
        self.assertEqual(pub.status_code, 200, pub.data)
        self.assertEqual(pub.data["emails"], 4)
        self.assertEqual(sum("result" in m.subject.lower() for m in mail.outbox), 4)
        self.client.force_authenticate(None)
        top = self.client.post("/api/v1/stre/result/", {"roll_no": r[1], "mobile": self.regs[1].mobile, **self.captcha()}).data
        self.assertEqual((top["rank"], top["marks"], top["award"], top["percentage"]), (1, 95.5, "Certificate of Merit", 95.5))
        self.assertEqual(self.client.post("/api/v1/stre/result/", {"roll_no": r[1], "mobile": "9000000000", **self.captcha()}).status_code, 400)
        verify = self.client.get(f"/api/v1/stre/certificate/verify/{top['certificate_code']}/")
        self.assertEqual((verify.data["valid"], verify.data["full_name"]), (True, self.regs[1].full_name))
        self.assertNotIn("mobile", verify.data)
        absent = self.client.get(f"/api/v1/stre/result/?token={self.regs[3].access_token}").data
        self.assertEqual((absent["is_absent"], absent["award"], absent["certificate_code"]), (True, "", ""))
        self.assertTrue(self.client.get(f"/api/v1/stre/status/?token={self.regs[1].access_token}").data["results_published"])
        self.assertTrue(self.client.get("/api/v1/stre/public/").data["results_published"])
        self.assertEqual(self.client.get("/api/v1/public-notices/").data["stre_result"], self.exam.title)
        # exam form se ON/OFF nahi hota (sirf Results page se)
        self.client.force_authenticate(self.stre_admin)
        self.client.patch(f"/api/v1/stre/admin/exams/{self.exam.id}/", {"results_published": False}, format="json")
        self.exam.refresh_from_db()
        self.assertTrue(self.exam.results_published)
        off = self.client.post("/api/v1/stre/admin/results/publish/", {"exam": str(self.exam.id), "publish": False}, format="json")
        self.assertEqual(off.status_code, 200)
        self.client.force_authenticate(None)
        self.assertFalse(self.client.get("/api/v1/stre/public/").data["results_published"])
        self.assertEqual(self.client.get(f"/api/v1/stre/result/?token={self.regs[1].access_token}").status_code, 400)

    def test_excel_upload_template_and_merit_export(self):
        from openpyxl import load_workbook
        tpl = self.client.get(f"/api/v1/stre/admin/results/template/?exam={self.exam.id}")
        wb = load_workbook(io.BytesIO(tpl.content))
        ws = wb.active
        self.assertEqual(ws.max_row, 5)  # header + 4 candidates
        for i, marks in zip(range(2, 6), (70, 88, None, 55)):
            ws.cell(row=i, column=5, value=marks)
        ws.cell(row=4, column=6, value="AB")
        buf = io.BytesIO(); wb.save(buf)
        up = self.client.post("/api/v1/stre/admin/results/upload/", {"exam": str(self.exam.id), "file": SimpleUploadedFile("m.xlsx", buf.getvalue())}, format="multipart")
        self.assertEqual(up.status_code, 200, up.data)
        self.assertEqual(up.data["saved"], 4)
        csv_text = self.client.get(f"/api/v1/stre/admin/results/export/?exam={self.exam.id}").content.decode("utf-8-sig")
        first = csv_text.splitlines()[1].split(",")
        self.assertEqual((first[0], first[1]), ("1", self.regs[1].roll_no))
        self.assertIn("AB", csv_text)
        school = make_school("r")
        self.client.force_authenticate(school["admin"])
        self.assertEqual(self.client.get(f"/api/v1/stre/admin/results/?exam={self.exam.id}").status_code, 403)
