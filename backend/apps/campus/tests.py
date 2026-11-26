import datetime
from decimal import Decimal

from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework.test import APITestCase
from django.test.utils import CaptureQueriesContext

from apps.academics.models import TeachingAssignment
from apps.campus.models import FeeInvoice, FeePayment, LeaveRequest, Notice
from apps.core.models import SupportRequest
from apps.core.roles import Role
from apps.core.tests import PW, User, make_school
from apps.students.tests import make_student, make_teacher


class CampusBase(APITestCase):
    def setUp(self):
        cache.clear()
        self.a = make_school("a")
        self.b = make_school("b")
        self.teacher = make_teacher(self.a, 1)
        self.a["room"].class_teacher = self.teacher
        self.a["room"].save()
        TeachingAssignment.objects.create(school=self.a["school"], classroom=self.a["room"], subject=self.a["subject"], teacher=self.teacher)
        self.student = make_student(self.a, 1)
        self.ec = User.objects.create_user(email="ec@a.com", password=PW, role=Role.EXAM_CONTROLLER, school=self.a["school"])
        self.today = timezone.localdate()


class NoticeTests(CampusBase):
    def test_audience_filtering(self):
        self.client.force_authenticate(self.a["admin"])
        for title, audience, level in [("All", "all", ""), ("Teachers", "teachers", ""), ("Class 10", "students", "10"), ("Class 5", "students", "5")]:
            res = self.client.post("/api/v1/notices/", {"title": title, "audience": audience, "class_level": level}, format="json")
            self.assertEqual(res.status_code, 201, res.data)
        self.client.force_authenticate(self.student.user)
        titles = {n["title"] for n in self.client.get("/api/v1/notices/").data["results"]}
        self.assertEqual(titles, {"All", "Class 10"})
        self.client.force_authenticate(self.teacher.user)
        titles = {n["title"] for n in self.client.get("/api/v1/notices/").data["results"]}
        self.assertEqual(titles, {"All", "Teachers"})

    def test_student_and_teacher_cannot_post(self):
        for user in (self.student.user, self.teacher.user):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.post("/api/v1/notices/", {"title": "x"}, format="json").status_code, 403)

    def test_future_notice_hidden_from_students(self):
        Notice.objects.create(school=self.a["school"], title="Later", publish_on=self.today + datetime.timedelta(days=3))
        self.client.force_authenticate(self.student.user)
        self.assertEqual(self.client.get("/api/v1/notices/").data["count"], 0)

    def test_other_school_isolated(self):
        Notice.objects.create(school=self.b["school"], title="B only")
        self.client.force_authenticate(self.a["admin"])
        self.assertEqual(self.client.get("/api/v1/notices/").data["count"], 0)


class TimetableHomeworkTests(CampusBase):
    def slot(self, **extra):
        body = {"classroom": str(self.a["room"].id), "day": 1, "period": 1, "start_time": "09:00", "end_time": "09:45", "subject": str(self.a["subject"].id), "teacher": str(self.teacher.id)}
        body.update(extra)
        return self.client.post("/api/v1/timetable/", body, format="json")

    def test_admin_builds_timetable_and_teacher_clash_is_blocked(self):
        self.client.force_authenticate(self.a["admin"])
        self.assertEqual(self.slot().status_code, 201)
        from apps.academics.models import ClassRoom
        room_b = ClassRoom.objects.create(school=self.a["school"], course=self.a["course"], academic_year=self.a["year"], section="B")
        res = self.slot(classroom=str(room_b.id), start_time="09:30", end_time="10:15")
        self.assertEqual(res.status_code, 400)
        self.client.force_authenticate(self.student.user)
        self.assertEqual(self.client.get("/api/v1/timetable/").data["count"], 1)
        self.assertEqual(self.slot(period=2).status_code, 403)

    def test_teacher_gives_homework_only_to_own_class(self):
        self.client.force_authenticate(self.teacher.user)
        body = {"classroom": str(self.a["room"].id), "subject": str(self.a["subject"].id), "title": "Ex 1.1", "due_date": (self.today + datetime.timedelta(days=2)).isoformat()}
        self.assertEqual(self.client.post("/api/v1/homework/", body, format="json").status_code, 201)
        other = make_teacher(self.a, 2)
        self.client.force_authenticate(other.user)
        self.assertEqual(self.client.post("/api/v1/homework/", body, format="json").status_code, 400)
        self.client.force_authenticate(self.student.user)
        self.assertEqual(self.client.get("/api/v1/homework/").data["count"], 1)
        self.assertEqual(self.client.post("/api/v1/homework/", body, format="json").status_code, 403)


class LeaveTests(CampusBase):
    def apply(self, user):
        self.client.force_authenticate(user)
        return self.client.post("/api/v1/leave-requests/", {"from_date": self.today.isoformat(), "to_date": (self.today + datetime.timedelta(days=1)).isoformat(), "reason": "Fever"}, format="json")

    def test_student_leave_approved_by_class_teacher(self):
        res = self.apply(self.student.user)
        self.assertEqual(res.status_code, 201, res.data)
        leave_id = res.data["id"]
        self.assertEqual(res.data["days"], 2)
        other_student = make_student(self.a, 2)
        self.client.force_authenticate(other_student.user)
        self.assertEqual(self.client.get(f"/api/v1/leave-requests/{leave_id}/").status_code, 404)
        self.client.force_authenticate(self.student.user)
        self.assertEqual(self.client.post(f"/api/v1/leave-requests/{leave_id}/approve/").status_code, 403)
        self.client.force_authenticate(self.teacher.user)
        res = self.client.post(f"/api/v1/leave-requests/{leave_id}/approve/", {"review_note": "Get well"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(LeaveRequest.objects.get(pk=leave_id).status, "approved")
        self.client.force_authenticate(self.student.user)
        self.assertEqual(self.client.patch(f"/api/v1/leave-requests/{leave_id}/", {"reason": "x"}, format="json").status_code, 400)

    def test_teacher_leave_only_admin_reviews(self):
        res = self.apply(self.teacher.user)
        self.assertEqual(self.client.post(f"/api/v1/leave-requests/{res.data['id']}/approve/").status_code, 403)
        self.client.force_authenticate(self.a["admin"])
        self.assertEqual(self.client.post(f"/api/v1/leave-requests/{res.data['id']}/reject/").status_code, 200)

    def test_bad_dates_rejected(self):
        self.client.force_authenticate(self.student.user)
        res = self.client.post("/api/v1/leave-requests/", {"from_date": "2026-05-10", "to_date": "2026-05-01", "reason": "x"}, format="json")
        self.assertEqual(res.status_code, 400)


class FeeTests(CampusBase):
    def test_fee_flow_invoice_payment_balance(self):
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post("/api/v1/fee-structures/", {"name": "Tuition Q1", "class_level": "10", "amount": "5000", "due_date": self.today.isoformat()}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        gen = self.client.post(f"/api/v1/fee-structures/{res.data['id']}/generate-invoices/")
        self.assertEqual(gen.data["created"], 1)
        self.assertEqual(self.client.post(f"/api/v1/fee-structures/{res.data['id']}/generate-invoices/").data["created"], 0)
        invoice = FeeInvoice.objects.get(student=self.student)
        pay = self.client.post("/api/v1/fee-payments/", {"invoice": str(invoice.id), "amount": "2000", "mode": "upi"}, format="json")
        self.assertEqual(pay.status_code, 201, pay.data)
        self.assertTrue(pay.data["receipt_no"].startswith("RCT-"))
        over = self.client.post("/api/v1/fee-payments/", {"invoice": str(invoice.id), "amount": "3500"}, format="json")
        self.assertEqual(over.status_code, 400)
        data = self.client.get(f"/api/v1/fee-invoices/{invoice.id}/").data
        self.assertEqual(data["status"], "partial")
        self.assertEqual(float(data["balance"]), 3000.0)
        self.assertEqual(self.client.delete(f"/api/v1/fee-invoices/{invoice.id}/").status_code, 400)
        summary = self.client.get("/api/v1/fee-invoices/summary/").data
        self.assertEqual(float(summary["collected"]), 2000.0)

    def test_invoice_list_aggregates_payments_without_per_invoice_queries(self):
        self.client.force_authenticate(self.a["admin"])
        invoices = {
            "paid": FeeInvoice.objects.create(school=self.a["school"], student=self.student, title="Paid", amount=100, due_date=self.today),
            "partial": FeeInvoice.objects.create(school=self.a["school"], student=self.student, title="Partial", amount=100, due_date=self.today),
            "overdue": FeeInvoice.objects.create(school=self.a["school"], student=self.student, title="Overdue", amount=100, due_date=self.today - datetime.timedelta(days=1)),
            "unpaid": FeeInvoice.objects.create(school=self.a["school"], student=self.student, title="Unpaid", amount=100, due_date=self.today),
        }
        FeePayment.objects.create(school=self.a["school"], invoice=invoices["paid"], amount=Decimal("100"))
        FeePayment.objects.create(school=self.a["school"], invoice=invoices["partial"], amount=Decimal("25"))

        with CaptureQueriesContext(connection) as queries:
            response = self.client.get("/api/v1/fee-invoices/")

        self.assertEqual(response.status_code, 200, response.data)
        payment_sum_queries = [
            query["sql"] for query in queries.captured_queries
            if "sum(" in query["sql"].lower() and "campus_feepayment" in query["sql"].lower()
        ]
        self.assertEqual(len(payment_sum_queries), 1)
        statuses = {row["title"]: row["status"] for row in response.data["results"]}
        self.assertEqual(statuses, {"Paid": "paid", "Partial": "partial", "Overdue": "overdue", "Unpaid": "unpaid"})
        for status, title in (("paid", "Paid"), ("partial", "Partial"), ("overdue", "Overdue"), ("unpaid", "Unpaid")):
            filtered = self.client.get(f"/api/v1/fee-invoices/?status={status}")
            self.assertEqual([row["title"] for row in filtered.data["results"]], [title])
        summary = self.client.get("/api/v1/fee-invoices/summary/").data
        self.assertEqual(summary["invoices"], 4)
        self.assertEqual(float(summary["total"]), 400)
        self.assertEqual(float(summary["collected"]), 125)
        self.assertEqual(float(summary["due"]), 275)
        self.assertEqual(summary["overdue"], 1)

    def test_fee_privacy(self):
        FeeInvoice.objects.create(school=self.a["school"], student=self.student, title="Bus", amount=100, due_date=self.today)
        other = make_student(self.a, 2)
        FeeInvoice.objects.create(school=self.a["school"], student=other, title="Bus", amount=100, due_date=self.today)
        self.client.force_authenticate(self.student.user)
        self.assertEqual(self.client.get("/api/v1/fee-invoices/").data["count"], 1)
        self.assertEqual(self.client.post("/api/v1/fee-payments/", {}, format="json").status_code, 403)
        for user in (self.teacher.user, self.ec):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get("/api/v1/fee-invoices/").status_code, 403)
            self.assertEqual(self.client.get("/api/v1/fee-structures/").status_code, 403)
        self.client.force_authenticate(self.b["admin"])
        self.assertEqual(self.client.get("/api/v1/fee-invoices/").data["count"], 0)


class ContactTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.a = make_school("a")

    def test_contact_enquiry_routes_to_school_inbox(self):
        res = self.client.post("/api/v1/support-requests/", {"name": "Ravi", "phone": "9876543210", "email": "ravi@example.com", "category": "admission", "subject": "Admission Class 6", "message": "Please share the admission process.", "school_code": "A"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        ticket = SupportRequest.objects.get()
        self.assertEqual(ticket.school, self.a["school"])
        self.assertEqual(ticket.name, "Ravi")
        self.client.force_authenticate(self.a["admin"])
        self.assertEqual(self.client.get("/api/v1/support-requests/").data["count"], 1)

    def test_bad_school_code(self):
        res = self.client.post("/api/v1/support-requests/", {"email": "x@example.com", "category": "contact", "subject": "Hi", "message": "Hello there, testing.", "school_code": "zzz"}, format="json")
        self.assertEqual(res.status_code, 400)


class AuditLogTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.a = make_school("a")
        self.b = make_school("b")

    def test_school_level_actions_visible_with_names_and_filters(self):
        self.client.force_authenticate(self.a["admin"])
        self.client.post("/api/v1/academics/courses/seed-classes/", {}, format="json")
        self.client.patch(f"/api/v1/schools/{self.a['school'].id}/", {"address": "Main Road"}, format="json")
        res = self.client.get("/api/v1/audit-logs/?action=seed_classes")
        self.assertEqual(res.data["count"], 1)
        row = res.data["results"][0]
        self.assertEqual(row["user_email"], "admin@a.com")
        self.assertEqual(row["user_role"], "school_admin")
        self.assertEqual(row["school_name"], "School a")
        self.assertEqual(self.client.get("/api/v1/audit-logs/?search=admin@a.com").data["count"] >= 2, True)
        today = timezone.localdate()
        self.assertGreaterEqual(self.client.get(f"/api/v1/audit-logs/?from={today}&to={today}").data["count"], 2)
        self.assertEqual(self.client.get("/api/v1/audit-logs/?from=2000-01-01&to=2000-01-02").data["count"], 0)

    def test_other_school_and_non_admin_cannot_read(self):
        self.client.force_authenticate(self.a["admin"])
        self.client.post("/api/v1/academics/courses/seed-classes/", {}, format="json")
        self.client.force_authenticate(self.b["admin"])
        self.assertEqual(self.client.get("/api/v1/audit-logs/").data["count"], 0)
        teacher = make_teacher(self.a, 9)
        self.client.force_authenticate(teacher.user)
        self.assertEqual(self.client.get("/api/v1/audit-logs/").status_code, 403)


class PublicNoticeTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.a = make_school("a")

    def test_only_public_current_notices_on_homepage(self):
        today = timezone.localdate()
        Notice.objects.create(school=self.a["school"], title="Annual day", is_public=True)
        Notice.objects.create(school=self.a["school"], title="Staff meeting", is_public=False)
        Notice.objects.create(school=self.a["school"], title="Future", is_public=True, publish_on=today + datetime.timedelta(days=2))
        Notice.objects.create(school=self.a["school"], title="Old", is_public=True, expires_on=today - datetime.timedelta(days=1))
        res = self.client.get("/api/v1/public-notices/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([n["title"] for n in res.data["notices"]], ["Annual day"])
        self.assertEqual(res.data["notices"][0]["school"], "School a")
        self.a["school"].is_active = False
        self.a["school"].save()
        self.assertEqual(self.client.get("/api/v1/public-notices/").data["notices"], [])

    def test_admin_marks_notice_public(self):
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post("/api/v1/notices/", {"title": "Sports day", "is_public": True}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/v1/public-notices/").data["notices"][0]["title"], "Sports day")


import tempfile  # noqa: E402

from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: E402
from django.test import override_settings  # noqa: E402

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class NoticePdfTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.a = make_school("np")
        self.b = make_school("nq")
        self.client.force_authenticate(self.a["admin"])

    def create(self, public, content=PDF, name="circular.pdf"):
        return self.client.post("/api/v1/notices/", {
            "title": "Annual day circular", "category": "circular", "audience": "all", "publish_on": timezone.localdate().isoformat(),
            "is_public": "true" if public else "false", "attachment": SimpleUploadedFile(name, content, content_type="application/pdf"),
        }, format="multipart")

    def test_public_pdf_visible_to_anyone_private_only_to_school(self):
        pub = self.create(True)
        self.assertEqual(pub.status_code, 201, pub.data)
        self.assertTrue(pub.data["attachment_url"].startswith("/api/v1/notice-files/"))
        priv = self.create(False)
        self.client.force_authenticate(None)
        res = self.client.get(pub.data["attachment_url"])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "application/pdf")
        self.assertEqual(b"".join(res.streaming_content)[:5], b"%PDF-")
        home = self.client.get("/api/v1/public-notices/").data["notices"]
        self.assertEqual(home[0]["attachment_url"], pub.data["attachment_url"])
        self.assertEqual(self.client.get(priv.data["attachment_url"]).status_code, 404)
        self.client.force_authenticate(self.b["admin"])
        self.assertEqual(self.client.get(priv.data["attachment_url"]).status_code, 404)
        student = make_student(self.a, 1)
        self.client.force_authenticate(student.user)
        self.assertEqual(self.client.get(priv.data["attachment_url"]).status_code, 200)

    def test_fake_pdf_rejected_and_remove(self):
        self.assertEqual(self.create(True, content=b"MZ not a pdf").status_code, 400)
        self.assertEqual(self.create(True, name="notes.docx").status_code, 400)
        ok = self.create(True)
        res = self.client.patch(f"/api/v1/notices/{ok.data['id']}/", {"remove_attachment": True}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIsNone(res.data["attachment_url"])
