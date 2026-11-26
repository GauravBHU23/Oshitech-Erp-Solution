import datetime
import tempfile

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.academics.models import AcademicYear, ClassRoom, Course, Subject, TeachingAssignment
from apps.core.models import AuditLog, SupportRequest
from apps.core.roles import Role
from apps.exams.models import Exam, ExamSchedule
from apps.schools.models import School
from apps.students.models import Student
from apps.teachers.models import Teacher
from apps.teachers.models import TeacherRating

User = get_user_model()
PW = "Str0ng-Passw0rd!"


def make_school(code):
    s = School.objects.create(name=f"School {code}", code=code)
    year = AcademicYear.objects.create(school=s, name="2026-27", start_date=datetime.date(2026, 4, 1), end_date=datetime.date(2027, 3, 31))
    course = Course.objects.create(school=s, name="Class 10", code="C10")
    subject = Subject.objects.create(school=s, course=course, name="Maths", code="MATH")
    room = ClassRoom.objects.create(school=s, course=course, academic_year=year, section="A")
    admin = User.objects.create_user(email=f"admin@{code}.com", password=PW, role=Role.SCHOOL_ADMIN, school=s)
    return dict(school=s, year=year, course=course, subject=subject, room=room, admin=admin)


class TenantIsolationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.a = make_school("a")
        self.b = make_school("b")

    def test_admin_sees_only_own_school_data(self):
        self.client.force_authenticate(self.a["admin"])
        res = self.client.get("/api/v1/academics/courses/")
        self.assertEqual(res.status_code, 200)
        ids = [c["id"] for c in res.data["results"]]
        self.assertEqual(ids, [str(self.a["course"].id)])

    def test_cannot_open_other_school_object(self):
        self.client.force_authenticate(self.a["admin"])
        res = self.client.get(f"/api/v1/academics/courses/{self.b['course'].id}/")
        self.assertEqual(res.status_code, 404)

    def test_cannot_reference_other_school_classroom(self):
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post(
            "/api/v1/students/",
            {"email": "kid@a.com", "first_name": "Kid", "password": PW, "admission_no": "1", "class_level": "10", "classroom": str(self.b["room"].id)},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(User.objects.filter(email="kid@a.com").exists())

    def test_create_student_creates_login_and_audit_log(self):
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post(
            "/api/v1/students/",
            {"email": "kid@a.com", "first_name": "Kid", "password": PW, "admission_no": "1", "class_level": "10", "father_name": "Ramesh", "mother_name": "Sita", "classroom": str(self.a["room"].id)},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertNotIn("password", res.data)
        logs = self.client.get("/api/v1/audit-logs/")
        self.assertEqual(logs.data["count"], 1)

    def test_school_admin_cannot_create_school(self):
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post("/api/v1/schools/", {"name": "X", "code": "x"}, format="json")
        self.assertEqual(res.status_code, 403)


class BootstrapSchoolSetupTests(APITestCase):
    def test_unassigned_school_admin_creates_first_school_and_links_school_accounts(self):
        admin = User.objects.create_user(
            email="bootstrap-admin@example.com",
            password=PW,
            role=Role.SCHOOL_ADMIN,
        )
        teacher = User.objects.create_user(
            email="bootstrap-teacher@example.com",
            password=PW,
            role=Role.TEACHER,
        )
        controller = User.objects.create_user(
            email="bootstrap-exam@example.com",
            password=PW,
            role=Role.EXAM_CONTROLLER,
        )
        self.client.force_authenticate(admin)

        schools = self.client.get("/api/v1/schools/")
        self.assertEqual(schools.status_code, 200)
        self.assertEqual(schools.data["count"], 0)

        response = self.client.post(
            "/api/v1/schools/",
            {"name": "North Campus", "code": "NORTH"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)

        school = School.objects.get(code="NORTH")
        for user in (admin, teacher, controller):
            user.refresh_from_db()
            self.assertEqual(user.school_id, school.id)
            self.assertTrue(user.check_password(PW))

        admin.refresh_from_db()
        self.client.force_authenticate(admin)
        own_school = self.client.get("/api/v1/schools/")
        self.assertEqual(own_school.status_code, 200)
        self.assertEqual(own_school.data["count"], 1)
        self.assertEqual(
            self.client.post(
                "/api/v1/schools/",
                {"name": "Second Campus", "code": "SECOND"},
                format="json",
            ).status_code,
            403,
        )

        self.client.force_authenticate(teacher)
        self.assertEqual(self.client.get("/api/v1/academics/courses/").status_code, 200)


class PublicSiteOverviewTests(APITestCase):
    def test_public_overview_counts_active_school_people(self):
        from apps.stre.models import StreExam, StreRegistration

        school = School.objects.create(name="Public School", code="PUBLIC")
        student_user = User.objects.create_user(
            email="student@public.com", password=PW, role=Role.STUDENT, school=school
        )
        Student.objects.create(school=school, user=student_user, admission_no="S1")
        teacher_user = User.objects.create_user(
            email="teacher@public.com", password=PW, role=Role.TEACHER, school=school
        )
        Teacher.objects.create(school=school, user=teacher_user, employee_id="T1")

        inactive_school = School.objects.create(
            name="Inactive School", code="INACTIVE", is_active=False
        )
        inactive_teacher = User.objects.create_user(
            email="inactive@public.com", password=PW, role=Role.TEACHER,
            school=inactive_school,
        )
        Teacher.objects.create(
            school=inactive_school, user=inactive_teacher, employee_id="T2"
        )

        exam = StreExam.objects.create(
            code="STRE26",
            exam_date=datetime.date.today(),
            last_date=datetime.date.today(),
        )
        for index, status in enumerate((
            StreRegistration.Status.PAID,
            StreRegistration.Status.ADMIT_CARD_ISSUED,
            StreRegistration.Status.PAYMENT_PENDING,
            StreRegistration.Status.CANCELLED,
        )):
            StreRegistration.objects.create(
                exam=exam,
                first_name="Candidate",
                last_name=str(index),
                email=f"candidate{index}@public.com",
                mobile=f"987654321{index}",
                father_name="Parent",
                subject="Mathematics",
                aim_of_life="Learn and grow",
                photo="",
                signature="",
                status=status,
            )

        response = self.client.get("/api/v1/public-overview/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {
            "schools": 1,
            "students": 1,
            "teachers": 1,
            "stre_registrations": 3,
        })


class TeacherRatingApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.data = make_school("rating")
        student_user = User.objects.create_user(
            email="student@rating.com", password=PW, role=Role.STUDENT,
            school=self.data["school"],
        )
        self.student = Student.objects.create(
            school=self.data["school"], user=student_user, admission_no="R1",
            classroom=self.data["room"],
        )
        teacher_user = User.objects.create_user(
            email="teacher@rating.com", password=PW, role=Role.TEACHER,
            school=self.data["school"], first_name="Teacher",
        )
        self.teacher = Teacher.objects.create(
            school=self.data["school"], user=teacher_user, employee_id="T1"
        )
        TeachingAssignment.objects.create(
            school=self.data["school"], teacher=self.teacher,
            classroom=self.data["room"], subject=self.data["subject"],
        )
        self.client.force_authenticate(student_user)

    def test_student_rating_updates_and_public_directory_only_shows_aggregate(self):
        payload = {
            "teacher_id": str(self.teacher.pk),
            "rating": 4,
            "feedback": "Helpful lessons.",
        }
        created = self.client.post(
            "/api/v1/teachers/my-ratings/", payload, format="json"
        )
        self.assertEqual(created.status_code, 201, created.data)

        payload["rating"] = 5
        updated = self.client.post(
            "/api/v1/teachers/my-ratings/", payload, format="json"
        )
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(TeacherRating.objects.count(), 1)

        directory = self.client.get("/api/v1/teachers/directory/")
        teacher = directory.data["results"][0]
        self.assertEqual(teacher["rating_average"], 5.0)
        self.assertEqual(teacher["rating_count"], 1)
        self.assertNotIn("feedback", teacher)

    def test_student_cannot_rate_teacher_outside_their_class(self):
        other_user = User.objects.create_user(
            email="other@rating.com", password=PW, role=Role.TEACHER,
            school=self.data["school"],
        )
        other_teacher = Teacher.objects.create(
            school=self.data["school"], user=other_user, employee_id="T2"
        )
        response = self.client.post(
            "/api/v1/teachers/my-ratings/",
            {"teacher_id": str(other_teacher.pk), "rating": 5},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_written_feedback_is_scoped_to_admin_school(self):
        other = make_school("ratingother")
        other_student_user = User.objects.create_user(
            email="student@ratingother.com", password=PW, role=Role.STUDENT,
            school=other["school"],
        )
        other_student = Student.objects.create(
            school=other["school"], user=other_student_user, admission_no="R2",
            classroom=other["room"],
        )
        other_teacher_user = User.objects.create_user(
            email="teacher@ratingother.com", password=PW, role=Role.TEACHER,
            school=other["school"],
        )
        other_teacher = Teacher.objects.create(
            school=other["school"], user=other_teacher_user, employee_id="T2"
        )
        own_rating = TeacherRating.objects.create(
            school=self.data["school"], teacher=self.teacher, student=self.student,
            rating=5, feedback="Excellent teaching.",
        )
        TeacherRating.objects.create(
            school=other["school"], teacher=other_teacher, student=other_student,
            rating=3, feedback="Needs more examples.",
        )

        self.client.force_authenticate(self.data["admin"])
        school_response = self.client.get("/api/v1/teachers/ratings/")
        self.assertEqual(school_response.status_code, 200)
        self.assertEqual(school_response.data["count"], 1)
        self.assertEqual(school_response.data["results"][0]["id"], str(own_rating.pk))

        super_admin = User.objects.create_user(
            email="super@ratings.com", password=PW, role=Role.SUPER_ADMIN
        )
        self.client.force_authenticate(super_admin)
        global_response = self.client.get("/api/v1/teachers/ratings/")
        self.assertEqual(global_response.status_code, 200)
        self.assertEqual(global_response.data["count"], 2)

        self.client.force_authenticate(self.student.user)
        forbidden_response = self.client.get("/api/v1/teachers/ratings/")
        self.assertEqual(forbidden_response.status_code, 403)


class PublicTeacherDirectoryTests(APITestCase):
    def test_lists_public_teacher_before_subject_assignment(self):
        school = School.objects.create(name="Public School", code="PUBLIC")
        teacher_user = User.objects.create_user(
            email="teacher@public.com", password=PW, role=Role.TEACHER, school=school,
            first_name="Ravi", last_name="Kumar",
        )
        Teacher.objects.create(school=school, user=teacher_user, employee_id="T1")

        response = self.client.get("/api/v1/teachers/directory/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["name"], "Ravi Kumar")
        self.assertEqual(response.data["results"][0]["teaching"], [])


class SupportRequestApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.data = make_school("support")

    def test_guest_can_report_login_issue_and_admins_can_triage(self):
        guest_response = self.client.post(
            "/api/v1/support-requests/",
            {
                "email": "visitor@example.com",
                "category": "login",
                "subject": "Unable to sign in",
                "message": "The login page returns an error.",
            },
            format="json",
        )
        self.assertEqual(guest_response.status_code, 201, guest_response.data)
        guest_ticket = SupportRequest.objects.get(pk=guest_response.data["id"])
        self.assertIsNone(guest_ticket.school_id)

        student_user = User.objects.create_user(
            email="student@support.com", password=PW, role=Role.STUDENT,
            school=self.data["school"],
        )
        self.client.force_authenticate(student_user)
        user_response = self.client.post(
            "/api/v1/support-requests/",
            {
                "email": "spoof@example.com",
                "category": "bug",
                "subject": "Page error",
                "message": "An error appears when opening results.",
            },
            format="json",
        )
        self.assertEqual(user_response.status_code, 201, user_response.data)
        user_ticket = SupportRequest.objects.get(pk=user_response.data["id"])
        self.assertEqual(user_ticket.email, student_user.email)
        self.assertEqual(user_ticket.school_id, self.data["school"].id)

        self.client.force_authenticate(self.data["admin"])
        school_tickets = self.client.get("/api/v1/support-requests/")
        self.assertEqual(school_tickets.data["count"], 1)
        self.assertEqual(school_tickets.data["open_count"], 1)
        self.assertEqual(school_tickets.data["results"][0]["id"], str(user_ticket.pk))

        admin_update = self.client.patch(
            f"/api/v1/support-requests/{user_ticket.pk}/",
            {"status": "in_progress"},
            format="json",
        )
        self.assertEqual(admin_update.status_code, 200, admin_update.data)
        self.assertEqual(admin_update.data["status"], "in_progress")

        super_admin = User.objects.create_user(
            email="super@support.com", password=PW, role=Role.SUPER_ADMIN
        )
        self.client.force_authenticate(super_admin)
        all_tickets = self.client.get("/api/v1/support-requests/")
        self.assertEqual(all_tickets.data["count"], 2)
        self.assertEqual(all_tickets.data["open_count"], 1)
        self.assertTrue(any(ticket["id"] == str(guest_ticket.pk) for ticket in all_tickets.data["results"]))

    def test_guests_must_provide_contact_email(self):
        response = self.client.post(
            "/api/v1/support-requests/",
            {
                "category": "other",
                "subject": "Question",
                "message": "I need help with my account.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class AuthTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.data = make_school("a")
        self.user = self.data["admin"]

    def test_login_sets_httponly_cookies(self):
        self.client.get("/api/v1/auth/csrf/")
        self.client.credentials(HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)
        from apps.accounts.testutils import login_payload
        res = self.client.post("/api/v1/auth/login/", login_payload("admin@a.com", PW), format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.cookies["access_token"]["httponly"])
        self.assertTrue(res.cookies["refresh_token"]["httponly"])
        me = self.client.get("/api/v1/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["email"], "admin@a.com")

    def test_login_requires_csrf_protection(self):
        from rest_framework.test import APIClient

        client = APIClient(enforce_csrf_checks=True)
        response = client.post("/api/v1/auth/login/", {}, format="json")
        self.assertEqual(response.status_code, 403, response.data)

    def test_lockout_after_5_failures(self):
        self.client.get("/api/v1/auth/csrf/")
        self.client.credentials(HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)
        for _ in range(5):
            from apps.accounts.testutils import login_payload
            r = self.client.post("/api/v1/auth/login/", login_payload("admin@a.com", "wrong"), format="json")
            self.assertEqual(r.status_code, 401)
        r = self.client.post("/api/v1/auth/login/", login_payload("admin@a.com", PW), format="json")
        self.assertEqual(r.status_code, 423)

    def test_unauthenticated_blocked(self):
        self.assertEqual(self.client.get("/api/v1/students/").status_code, 401)

    def test_student_registration_requires_approval_then_placement(self):
        from apps.accounts.testutils import login_payload

        application = self.client.post("/api/v1/auth/register/", {
            "school_code": self.data["school"].code,
            "role": Role.STUDENT,
            "email": "new-student@a.com",
            "password": PW,
            "first_name": "New",
            "gender": "M",
            "last_name": "Student",
            "class_level": "10",
            "date_of_birth": "2010-01-01",
            "father_name": "Ramesh Verma",
            "mother_name": "Anita Verma",
            "guardian_phone": "9876543210",
            "address": "School Road",
            "course_id": str(self.data["course"].id),
            "academic_year_id": str(self.data["year"].id),
        }, format="json")
        self.assertEqual(application.status_code, 201, application.data)

        self.client.get("/api/v1/auth/csrf/")
        self.client.credentials(HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)
        pending_login = self.client.post("/api/v1/auth/login/", login_payload("new-student@a.com", PW), format="json")
        self.assertEqual(pending_login.status_code, 403)
        self.assertIn("waiting for school admin approval", pending_login.data["detail"])

        self.client.force_authenticate(self.user)
        inbox = self.client.get("/api/v1/auth/registration-requests/?status=pending")
        self.assertEqual(inbox.data["count"], 1)
        approved = self.client.post(f"/api/v1/auth/registration-requests/{application.data['id']}/approve/")
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertEqual(self.client.get("/api/v1/auth/registration-requests/?status=pending").data["count"], 0)

        self.client.force_authenticate(None)
        inactive_login = self.client.post("/api/v1/auth/login/", login_payload("new-student@a.com", PW), format="json")
        self.assertEqual(inactive_login.status_code, 403)
        self.assertIn("assign your classroom and activate", inactive_login.data["detail"])


class ExamSecurityTests(APITestCase):
    def setUp(self):
        cache.clear()
        d = make_school("a")
        self.d = d
        self.exam = Exam.objects.create(
            school=d["school"], name="Final", course=d["course"], academic_year=d["year"],
            start_date=datetime.date(2027, 3, 1), end_date=datetime.date(2027, 3, 10), status="scheduled",
        )
        ExamSchedule.objects.create(
            school=d["school"], exam=self.exam, subject=d["subject"], date=datetime.date(2027, 3, 2),
            start_time=datetime.time(10), end_time=datetime.time(13), max_marks=100,
        )
        su = User.objects.create_user(email="s@a.com", password=PW, role=Role.STUDENT, school=d["school"])
        self.student = Student.objects.create(school=d["school"], user=su, admission_no="1", classroom=d["room"])
        self.student_user = su
        self.teacher_user = User.objects.create_user(email="t@a.com", password=PW, role=Role.TEACHER, school=d["school"])
        self.teacher = Teacher.objects.create(school=d["school"], user=self.teacher_user, employee_id="T1")
        TeachingAssignment.objects.create(school=d["school"], teacher=self.teacher, classroom=d["room"], subject=d["subject"])

    def _result(self, marks):
        return self.client.post(
            "/api/v1/exams/results/",
            {"exam": str(self.exam.id), "student": str(self.student.id), "subject": str(self.d["subject"].id), "marks_obtained": marks},
            format="json",
        )

    def test_marks_cannot_exceed_max(self):
        self.client.force_authenticate(self.teacher_user)
        self.assertEqual(self._result(101).status_code, 400)
        self.assertEqual(self._result(85).status_code, 201)

    def test_publish_locks_results_and_hides_until_published(self):
        self.client.force_authenticate(self.teacher_user)
        rid = self._result(85).data["id"]

        self.client.force_authenticate(self.student_user)
        self.assertEqual(self.client.get("/api/v1/exams/results/").data["count"], 0)

        self.client.force_authenticate(self.d["admin"])
        self.assertEqual(self.client.post(f"/api/v1/exams/exams/{self.exam.id}/publish-results/").status_code, 200)

        self.client.force_authenticate(self.teacher_user)
        self.assertEqual(self.client.patch(f"/api/v1/exams/results/{rid}/", {"marks_obtained": 99}, format="json").status_code, 400)
        self.assertEqual(self.client.post(f"/api/v1/exams/exams/{self.exam.id}/unlock-results/").status_code, 403)

        self.client.force_authenticate(self.student_user)
        self.assertEqual(self.client.get("/api/v1/exams/results/").data["count"], 1)

    def test_admit_card_generate_and_public_verify(self):
        self.client.force_authenticate(self.d["admin"])
        r = self.client.post(f"/api/v1/exams/exams/{self.exam.id}/generate-admit-cards/")
        self.assertEqual(r.data["created"], 1)
        card = self.client.get("/api/v1/exams/admit-cards/").data["results"][0]
        self.assertEqual(card["school_name"], self.d["school"].name)
        self.assertEqual(card["course_name"], self.d["course"].name)
        self.assertIsNone(card["student_photo"])
        code = card["code"]
        self.client.force_authenticate(None)
        ok = self.client.get(f"/api/v1/exams/verify/{code}/")
        self.assertTrue(ok.data["valid"])
        self.assertEqual(self.client.get("/api/v1/exams/verify/FAKECODE123/").status_code, 404)

    def test_exam_controller_can_view_student_photo(self):
        controller = User.objects.create_user(
            email="exam-controller@a.com", password=PW,
            role=Role.EXAM_CONTROLLER, school=self.d["school"],
        )
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                self.student_user.profile_photo = SimpleUploadedFile("student.jpg", b"photo")
                self.student_user.save(update_fields=["profile_photo"])
                self.client.force_authenticate(self.d["admin"])
                generated = self.client.post(
                    f"/api/v1/exams/exams/{self.exam.id}/generate-admit-cards/"
                )
                self.assertEqual(generated.status_code, 200, generated.data)
                self.client.force_authenticate(controller)
                card = self.client.get("/api/v1/exams/admit-cards/").data["results"][0]
                self.assertEqual(
                    card["student_photo"],
                    f"/api/v1/auth/profile-photos/{self.student_user.id}/",
                )
                response = self.client.get(
                    f"/api/v1/auth/profile-photos/{self.student_user.id}/"
                )
                self.assertEqual(response.status_code, 200)
                # File band karo (Windows temp folder hata sake) — response.close() nahi, woh
                # "request finished" signal bhej ke PostgreSQL par test ka DB connection band kar deta hai
                self.assertEqual(b"".join(response.streaming_content), b"photo")
                for close in response._resource_closers:  # sirf file band, signal nahi
                    close()

    def test_student_with_blank_class_level_can_be_placed_and_activated(self):
        self.client.force_authenticate(self.d["admin"])
        response = self.client.patch(
            f"/api/v1/students/{self.student.id}/",
            {"classroom": str(self.d["room"].id), "class_level": None, "is_active": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.student.refresh_from_db()
        self.assertEqual(self.student.classroom_id, self.d["room"].id)
        self.assertTrue(self.student.is_active)
        generated = self.client.post(f"/api/v1/exams/exams/{self.exam.id}/generate-admit-cards/")
        self.assertEqual(generated.data, {"created": 1, "total_students": 1})


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AdminEmailTests(APITestCase):
    def setUp(self):
        from django.core.cache import cache
        from django.core import mail

        cache.clear()
        mail.outbox.clear()
        self.school = make_school("mail-a")
        other = make_school("mail-b")
        self.teacher = User.objects.create_user(
            email="teacher@mail-a.example", password=PW,
            role=Role.TEACHER, school=self.school["school"],
        )
        self.outside_teacher = User.objects.create_user(
            email="teacher@mail-b.example", password=PW,
            role=Role.TEACHER, school=other["school"],
        )
        self.super_admin = User.objects.create_user(
            email="super@mail.example", password=PW, role=Role.SUPER_ADMIN,
        )

    def payload(self, recipient):
        return {"recipient_email": recipient, "subject": "Schedule update", "message": "The schedule has been updated."}

    def test_super_admin_can_send_to_one_external_address(self):
        from django.core import mail

        self.client.force_authenticate(self.super_admin)
        response = self.client.post("/api/v1/admin-email/", self.payload("outside@example.com"), format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["outside@example.com"])
        self.assertEqual(AuditLog.objects.filter(action="admin_email_sent").count(), 1)

    def test_school_admin_can_only_send_to_own_school_accounts(self):
        from django.core import mail

        self.client.force_authenticate(self.school["admin"])
        allowed = self.client.post("/api/v1/admin-email/", self.payload(self.teacher.email), format="json")
        self.assertEqual(allowed.status_code, 200, allowed.data)
        self.assertEqual(mail.outbox[-1].to, [self.teacher.email])
        denied = self.client.post("/api/v1/admin-email/", self.payload(self.outside_teacher.email), format="json")
        self.assertEqual(denied.status_code, 400)
        self.assertEqual(len(mail.outbox), 1)

    def test_non_admin_cannot_use_direct_email_tool(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post("/api/v1/admin-email/", self.payload("outside@example.com"), format="json")
        self.assertEqual(response.status_code, 403)
