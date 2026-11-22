import io
import datetime

from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.academics.models import ClassRoom, Course, Subject, TeachingAssignment
from apps.attendance.models import Attendance
from apps.core.roles import Role
from apps.core.tests import PW, User, make_school
from apps.exams.models import Exam, ExamSchedule, Result
from apps.students.models import IDCard, Student
from apps.teachers.models import Teacher


def make_student(ctx, n, room=None):
    user = User.objects.create_user(email=f"s{n}@{ctx['school'].code}.com", password=PW, role=Role.STUDENT, school=ctx["school"])
    return Student.objects.create(school=ctx["school"], user=user, admission_no=f"A{n}", class_level="10", classroom=room or ctx["room"])


def make_teacher(ctx, n):
    user = User.objects.create_user(email=f"t{n}@{ctx['school'].code}.com", password=PW, role=Role.TEACHER, school=ctx["school"])
    return Teacher.objects.create(school=ctx["school"], user=user, employee_id=f"E{n}")


class IDCardTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.a = make_school("a")
        self.b = make_school("b")

    def test_admission_issues_id_card_automatically(self):
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post(
            "/api/v1/students/",
            {"email": "kid@a.com", "first_name": "Kid", "password": PW, "admission_no": "77", "class_level": "5", "father_name": "Ramesh Kumar", "mother_name": "Sita Devi"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        card = IDCard.objects.get(student_id=res.data["id"])
        self.assertEqual(card.holder_type, "student")
        self.assertEqual(card.school_id, self.a["school"].id)
        listed = self.client.get("/api/v1/id-cards/")
        self.assertEqual(listed.data["count"], 1)
        self.assertEqual(listed.data["results"][0]["reference_no"], "77")

    def test_teacher_joining_issues_card(self):
        teacher = make_teacher(self.a, 1)
        self.assertTrue(IDCard.objects.filter(teacher=teacher, holder_type="teacher").exists())

    def test_student_sees_only_own_card_and_cannot_reissue(self):
        mine = make_student(self.a, 1)
        make_student(self.a, 2)
        self.client.force_authenticate(mine.user)
        res = self.client.get("/api/v1/id-cards/")
        self.assertEqual([str(c["student"]) for c in res.data["results"]], [str(mine.id)])
        card = mine.id_card
        self.assertEqual(self.client.post(f"/api/v1/id-cards/{card.id}/reissue/").status_code, 403)

    def test_other_school_admin_cannot_see_card(self):
        student = make_student(self.a, 1)
        self.client.force_authenticate(self.b["admin"])
        self.assertEqual(self.client.get(f"/api/v1/id-cards/{student.id_card.id}/").status_code, 404)

    def test_reissue_changes_code_and_revoke_fails_verification(self):
        student = make_student(self.a, 1)
        old = student.id_card.code
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post(f"/api/v1/id-cards/{student.id_card.id}/reissue/")
        self.assertEqual(res.status_code, 200)
        self.assertNotEqual(res.data["code"], old)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/v1/id-cards/verify/{old}/").status_code, 404)
        ok = self.client.get(f"/api/v1/id-cards/verify/{res.data['code']}/")
        self.assertTrue(ok.data["valid"])
        self.assertNotIn("guardian_phone", ok.data)
        self.client.force_authenticate(self.a["admin"])
        self.client.post(f"/api/v1/id-cards/{student.id_card.id}/revoke/")
        self.client.force_authenticate(None)
        revoked = self.client.get(f"/api/v1/id-cards/verify/{res.data['code']}/")
        self.assertFalse(revoked.data["valid"])
        self.assertEqual(revoked.data["status"], "revoked")

    def test_issue_missing_covers_old_records(self):
        student = make_student(self.a, 1)
        student.id_card.delete()
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post("/api/v1/id-cards/issue-missing/")
        self.assertEqual(res.data["issued"], 1)
        self.assertTrue(IDCard.objects.filter(student=student).exists())

    def test_student_filter_by_class_level(self):
        make_student(self.a, 1)
        self.client.force_authenticate(self.a["admin"])
        self.assertEqual(self.client.get("/api/v1/students/?class_level=10").data["count"], 1)
        self.assertEqual(self.client.get("/api/v1/students/?class_level=3").data["count"], 0)


class ClassSetupTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.a = make_school("a")

    def test_seed_classes_creates_class_1_to_12_once(self):
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post("/api/v1/academics/courses/seed-classes/", {}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        # "Class 10" already existed in make_school, so 11 new courses
        self.assertEqual(res.data["courses"], 11)
        names = set(Course.objects.filter(school=self.a["school"]).values_list("name", flat=True))
        self.assertEqual(names, {f"Class {n}" for n in range(1, 13)})
        again = self.client.post("/api/v1/academics/courses/seed-classes/", {}, format="json")
        self.assertEqual(again.data["courses"], 0)
        self.assertEqual(again.data["subjects"], 0)

    def test_teacher_cannot_seed_classes(self):
        teacher = make_teacher(self.a, 1)
        self.client.force_authenticate(teacher.user)
        self.assertEqual(self.client.post("/api/v1/academics/courses/seed-classes/").status_code, 403)

    def test_school_admin_edits_profile_but_not_code_or_plan(self):
        self.client.force_authenticate(self.a["admin"])
        url = f"/api/v1/schools/{self.a['school'].id}/"
        res = self.client.patch(url, {"address": "Main Road", "code": "zzz", "plan": "premium", "is_active": False}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        school = self.a["school"]
        school.refresh_from_db()
        self.assertEqual(school.address, "Main Road")
        self.assertEqual(school.code, "a")
        self.assertEqual(school.plan, "standard")
        self.assertTrue(school.is_active)
        self.assertEqual(self.client.delete(url).status_code, 403)

    def test_only_one_current_academic_year(self):
        self.client.force_authenticate(self.a["admin"])
        self.client.post("/api/v1/academics/academic-years/", {"name": "2025-26", "start_date": "2025-04-01", "end_date": "2026-03-31", "is_current": True}, format="json")
        self.client.post("/api/v1/academics/academic-years/", {"name": "2027-28", "start_date": "2027-04-01", "end_date": "2028-03-31", "is_current": True}, format="json")
        from apps.academics.models import AcademicYear
        self.assertEqual(list(AcademicYear.objects.filter(school=self.a["school"], is_current=True).values_list("name", flat=True)), ["2027-28"])


class AttendanceTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.a = make_school("a")
        self.teacher = make_teacher(self.a, 1)
        self.other_teacher = make_teacher(self.a, 2)
        self.a["room"].class_teacher = self.teacher
        self.a["room"].save()
        self.s1 = make_student(self.a, 1)
        self.s2 = make_student(self.a, 2)
        self.today = timezone.localdate().isoformat()

    def mark(self, user, statuses):
        self.client.force_authenticate(user)
        return self.client.post(
            "/api/v1/attendance/mark/",
            {"classroom": str(self.a["room"].id), "date": self.today, "entries": [{"student": str(s.id), "status": st} for s, st in statuses]},
            format="json",
        )

    def test_class_teacher_marks_and_updates_attendance(self):
        res = self.mark(self.teacher.user, [(self.s1, "present"), (self.s2, "absent")])
        self.assertEqual(res.status_code, 200, res.data)
        self.mark(self.teacher.user, [(self.s2, "late")])
        self.assertEqual(Attendance.objects.count(), 2)
        self.assertEqual(Attendance.objects.get(student=self.s2).status, "late")
        summary = self.client.get(f"/api/v1/attendance/summary/?classroom={self.a['room'].id}")
        by_student = {row["student"]: row for row in summary.data}
        self.assertEqual(by_student[str(self.s1.id)]["percentage"], 100.0)

    def test_unrelated_teacher_cannot_mark(self):
        res = self.mark(self.other_teacher.user, [(self.s1, "present")])
        self.assertEqual(res.status_code, 404)

    def test_student_cannot_mark_and_sees_only_own(self):
        self.mark(self.teacher.user, [(self.s1, "present"), (self.s2, "absent")])
        self.assertEqual(self.mark(self.s1.user, [(self.s1, "present")]).status_code, 403)
        res = self.client.get("/api/v1/attendance/")
        self.assertEqual([str(r["student"]) for r in res.data["results"]], [str(self.s1.id)])

    def test_future_date_rejected(self):
        self.client.force_authenticate(self.teacher.user)
        future = (timezone.localdate() + datetime.timedelta(days=2)).isoformat()
        res = self.client.post("/api/v1/attendance/mark/", {"classroom": str(self.a["room"].id), "date": future, "entries": [{"student": str(self.s1.id), "status": "present"}]}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_exam_controller_has_no_attendance_access(self):
        ec = User.objects.create_user(email="ec@a.com", password=PW, role=Role.EXAM_CONTROLLER, school=self.a["school"])
        self.client.force_authenticate(ec)
        self.assertEqual(self.client.get("/api/v1/attendance/").status_code, 403)


class BulkMarksTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.a = make_school("a")
        self.exam = Exam.objects.create(school=self.a["school"], name="Mid term", course=self.a["course"], academic_year=self.a["year"], start_date=datetime.date(2026, 9, 1), end_date=datetime.date(2026, 9, 10))
        ExamSchedule.objects.create(school=self.a["school"], exam=self.exam, subject=self.a["subject"], date=datetime.date(2026, 9, 2), start_time="10:00", end_time="13:00", max_marks=100, pass_marks=33)
        self.s1 = make_student(self.a, 1)
        self.s2 = make_student(self.a, 2)

    def payload(self, entries):
        return {"exam": str(self.exam.id), "subject": str(self.a["subject"].id), "entries": entries}

    def test_admin_saves_whole_class_and_resubmits(self):
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post("/api/v1/exams/results/bulk/", self.payload([
            {"student": str(self.s1.id), "marks_obtained": "78"},
            {"student": str(self.s2.id), "is_absent": True},
        ]), format="json")
        self.assertEqual(res.status_code, 200, res.data)
        res = self.client.post("/api/v1/exams/results/bulk/", self.payload([{"student": str(self.s1.id), "marks_obtained": "80"}]), format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(Result.objects.count(), 2)
        self.assertEqual(float(Result.objects.get(student=self.s1).marks_obtained), 80.0)

    def test_invalid_row_saves_nothing(self):
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post("/api/v1/exams/results/bulk/", self.payload([
            {"student": str(self.s1.id), "marks_obtained": "50"},
            {"student": str(self.s2.id), "marks_obtained": "150"},
        ]), format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Result.objects.count(), 0)

    def test_unassigned_teacher_rejected(self):
        teacher = make_teacher(self.a, 1)
        self.client.force_authenticate(teacher.user)
        res = self.client.post("/api/v1/exams/results/bulk/", self.payload([{"student": str(self.s1.id), "marks_obtained": "50"}]), format="json")
        self.assertEqual(res.status_code, 400)
        TeachingAssignment.objects.create(school=self.a["school"], classroom=self.a["room"], subject=self.a["subject"], teacher=teacher)
        res = self.client.post("/api/v1/exams/results/bulk/", self.payload([{"student": str(self.s1.id), "marks_obtained": "50"}]), format="json")
        self.assertEqual(res.status_code, 200, res.data)

    def test_locked_results_reject_bulk(self):
        self.exam.results_locked = True
        self.exam.save()
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post("/api/v1/exams/results/bulk/", self.payload([{"student": str(self.s1.id), "marks_obtained": "50"}]), format="json")
        self.assertEqual(res.status_code, 400)

    def test_teacher_sees_admit_cards_only_for_own_students(self):
        teacher = make_teacher(self.a, 1)
        other_room = ClassRoom.objects.create(school=self.a["school"], course=self.a["course"], academic_year=self.a["year"], section="B")
        make_student(self.a, 3, room=other_room)
        TeachingAssignment.objects.create(school=self.a["school"], classroom=self.a["room"], subject=self.a["subject"], teacher=teacher)
        self.client.force_authenticate(self.a["admin"])
        self.client.post(f"/api/v1/exams/exams/{self.exam.id}/generate-admit-cards/")
        self.client.force_authenticate(teacher.user)
        res = self.client.get("/api/v1/exams/admit-cards/")
        self.assertEqual(res.data["count"], 2)

    def test_schedule_subject_must_match_exam_course(self):
        other_course = Course.objects.create(school=self.a["school"], name="Class 9", code="C9")
        other_subject = Subject.objects.create(school=self.a["school"], course=other_course, name="Science", code="SCI9")
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post("/api/v1/exams/schedules/", {"exam": str(self.exam.id), "subject": str(other_subject.id), "date": "2026-09-03", "start_time": "10:00", "end_time": "12:00"}, format="json")
        self.assertEqual(res.status_code, 400)


class ParentNameTests(APITestCase):
    """Student ke liye father aur mother dono ka naam zaroori hai."""

    def setUp(self):
        cache.clear()
        self.a = make_school("a")

    def registration(self, **overrides):
        body = {
            "school_code": "a", "role": "student", "email": "reg@a.com", "password": PW, "first_name": "Reg", "last_name": "Kumar",
            "class_level": "6", "date_of_birth": "2014-02-02", "father_name": "Mohan Lal", "mother_name": "Geeta Devi",
            "guardian_phone": "9876543210", "address": "Main Road", "gender": "F",
            "course_id": str(self.a["course"].id), "academic_year_id": str(self.a["year"].id),
        }
        body.update(overrides)
        return self.client.post("/api/v1/auth/register/", body, format="json")

    def test_registration_requires_both_parents(self):
        for field in ("father_name", "mother_name"):
            res = self.registration(**{field: "  "})
            self.assertEqual(res.status_code, 400)
            self.assertIn(field, res.data)

    def test_approval_copies_parent_names_to_student_and_id_card(self):
        res = self.registration()
        self.assertEqual(res.status_code, 201, res.data)
        self.client.force_authenticate(self.a["admin"])
        self.assertEqual(self.client.post(f"/api/v1/auth/registration-requests/{res.data['id']}/approve/").status_code, 200)
        student = Student.objects.get(user__email="reg@a.com")
        self.assertEqual((student.father_name, student.mother_name), ("Mohan Lal", "Geeta Devi"))
        details = self.client.get(f"/api/v1/id-cards/?student={student.id}").data["results"][0]["details"]
        self.assertEqual((details["father_name"], details["mother_name"]), ("Mohan Lal", "Geeta Devi"))

    def test_admin_admission_requires_both_parents(self):
        self.client.force_authenticate(self.a["admin"])
        body = {"email": "k@a.com", "first_name": "K", "password": PW, "admission_no": "9", "class_level": "3", "father_name": "Mohan"}
        res = self.client.post("/api/v1/students/", body, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("mother_name", res.data)
        res = self.client.post("/api/v1/students/", {**body, "mother_name": "Geeta"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        cleared = self.client.patch(f"/api/v1/students/{res.data['id']}/", {"mother_name": ""}, format="json")
        self.assertEqual(cleared.status_code, 400)


class PhoneAndDobValidationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.a = make_school("a")

    def registration(self, **overrides):
        body = {
            "school_code": "a", "role": "student", "email": "reg@a.com", "password": PW, "first_name": "Reg", "last_name": "Kumar",
            "class_level": "6", "date_of_birth": "2014-02-02", "father_name": "Mohan", "mother_name": "Geeta",
            "guardian_phone": "9876543210", "address": "Main Road", "gender": "F",
            "course_id": str(self.a["course"].id), "academic_year_id": str(self.a["year"].id),
        }
        body.update(overrides)
        return self.client.post("/api/v1/auth/register/", body, format="json")

    def test_bad_phones_rejected_with_field_error(self):
        for bad in ("12345", "5876543210", "98765432101", "abcdefghij"):
            res = self.registration(guardian_phone=bad)
            self.assertEqual(res.status_code, 400, bad)
            self.assertIn("guardian_phone", res.data)

    def test_phone_is_normalised(self):
        res = self.registration(guardian_phone="+91 98765-43210")
        self.assertEqual(res.status_code, 201, res.data)
        from apps.accounts.models import RegistrationRequest
        self.assertEqual(RegistrationRequest.objects.get().details["guardian_phone"], "9876543210")

    def test_future_or_too_young_dob_rejected(self):
        future = (timezone.localdate() + datetime.timedelta(days=5)).isoformat()
        self.assertIn("date_of_birth", self.registration(date_of_birth=future).data)
        self.assertIn("date_of_birth", self.registration(date_of_birth=timezone.localdate().isoformat()).data)

    def test_admin_student_and_teacher_phone_validation(self):
        self.client.force_authenticate(self.a["admin"])
        res = self.client.post("/api/v1/students/", {"email": "k@a.com", "first_name": "K", "password": PW, "admission_no": "9", "class_level": "3", "father_name": "F", "mother_name": "M", "guardian_phone": "123"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("guardian_phone", res.data)
        res = self.client.post("/api/v1/teachers/", {"email": "t@a.com", "first_name": "T", "password": PW, "employee_id": "E9", "phone": "000"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("phone", res.data)

    def test_school_phone_and_pincode(self):
        self.client.force_authenticate(self.a["admin"])
        url = f"/api/v1/schools/{self.a['school'].id}/"
        self.assertEqual(self.client.patch(url, {"phone": "0542 2368000", "pincode": "221005"}, format="json").status_code, 200)
        res = self.client.patch(url, {"phone": "12", "pincode": "22"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("phone", res.data)
        self.assertIn("pincode", res.data)

    def test_account_edit_with_bad_phone_changes_nothing(self):
        student = make_student(self.a, 1)
        self.client.force_authenticate(self.a["admin"])
        res = self.client.patch(f"/api/v1/auth/users/{student.user_id}/", {"first_name": "Changed", "phone": "999"}, format="json")
        self.assertEqual(res.status_code, 400)
        student.user.refresh_from_db()
        self.assertNotEqual(student.user.first_name, "Changed")


class NameValidationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.a = make_school("a")

    def registration(self, **overrides):
        body = {
            "school_code": "a", "role": "student", "email": "n@a.com", "password": PW, "first_name": "Riya", "last_name": "Verma",
            "class_level": "6", "date_of_birth": "2014-02-02", "father_name": "Mohan Lal", "mother_name": "Geeta Devi",
            "guardian_phone": "9876543210", "address": "Main Road", "gender": "F",
            "course_id": str(self.a["course"].id), "academic_year_id": str(self.a["year"].id),
        }
        body.update(overrides)
        return self.client.post("/api/v1/auth/register/", body, format="json")

    def test_last_name_required_for_student_registration(self):
        res = self.registration(last_name="")
        self.assertEqual(res.status_code, 400)
        self.assertIn("last_name", res.data)

    def test_bad_names_rejected(self):
        for field in ("first_name", "last_name", "father_name", "mother_name"):
            for bad in ("R2D2", "a", "@@@", "123"):
                res = self.registration(**{field: bad})
                self.assertEqual(res.status_code, 400, (field, bad))
                self.assertIn(field, res.data)

    def test_hindi_and_initials_accepted_and_spaces_cleaned(self):
        res = self.registration(first_name="रिया", last_name="O'Brien", father_name="M.  K.  Gandhi", mother_name="Anne-Marie")
        self.assertEqual(res.status_code, 201, res.data)
        from apps.accounts.models import RegistrationRequest
        reg = RegistrationRequest.objects.get(email="n@a.com")
        self.assertEqual(reg.details["father_name"], "M. K. Gandhi")


class RegistrationRequiredChoicesTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.a = make_school("a")

    def body(self, **overrides):
        data = {
            "school_code": "a", "role": "student", "email": "g@a.com", "password": PW, "first_name": "Riya", "last_name": "Verma",
            "class_level": "6", "date_of_birth": "2014-02-02", "father_name": "Mohan Lal", "mother_name": "Geeta Devi",
            "guardian_phone": "9876543210", "address": "Main Road", "gender": "F",
            "course_id": str(self.a["course"].id), "academic_year_id": str(self.a["year"].id),
        }
        data.update(overrides)
        return data

    def test_gender_course_and_year_required(self):
        for field in ("gender", "course_id", "academic_year_id"):
            data = self.body()
            data.pop(field)
            res = self.client.post("/api/v1/auth/register/", data, format="json")
            self.assertEqual(res.status_code, 400, field)
            self.assertIn(field, res.data)

    def test_course_and_year_optional_when_school_has_none(self):
        from apps.academics.models import AcademicYear, Course
        Course.objects.filter(school=self.a["school"]).delete()
        AcademicYear.objects.filter(school=self.a["school"]).delete()
        data = self.body()
        data.pop("course_id")
        data.pop("academic_year_id")
        res = self.client.post("/api/v1/auth/register/", data, format="json")
        self.assertEqual(res.status_code, 201, res.data)


class PromotionTests(APITestCase):
    URL = "/api/v1/students/promote/"

    def setUp(self):
        from apps.academics.models import AcademicYear
        from apps.students.models import issue_id_card
        cache.clear()
        self.a = make_school("pa")
        self.b = make_school("pb")
        self.next_year = AcademicYear.objects.create(school=self.a["school"], name="2027-28", start_date=datetime.date(2027, 4, 1), end_date=datetime.date(2028, 3, 31))
        c11 = Course.objects.create(school=self.a["school"], name="Class 11", code="C11")
        self.room11 = ClassRoom.objects.create(school=self.a["school"], course=c11, academic_year=self.next_year, section="A", capacity=2)
        self.room10_next = ClassRoom.objects.create(school=self.a["school"], course=self.a["course"], academic_year=self.next_year, section="A")
        self.s1, self.s2, self.s3 = (make_student(self.a, n) for n in (1, 2, 3))
        for s in (self.s1, self.s2, self.s3):
            s.roll_no = f"R{s.admission_no}"
            s.save()
            issue_id_card(student=s)
        self.client.force_authenticate(self.a["admin"])

    def body(self, **extra):
        data = {
            "from_class_level": "10", "target_year": str(self.next_year.id), "to_classroom": str(self.room11.id),
            "detain_classroom": str(self.room10_next.id), "make_year_current": True,
            "decisions": [{"student": str(self.s1.id), "action": "promote"}, {"student": str(self.s2.id), "action": "promote"}, {"student": str(self.s3.id), "action": "detain"}],
        }
        data.update(extra)
        return data

    def test_promote_detain_and_undo(self):
        res = self.client.post(self.URL, self.body(), format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data["promoted"], res.data["detained"]), (2, 1))
        self.s1.refresh_from_db(); self.s3.refresh_from_db()
        self.assertEqual((self.s1.class_level, self.s1.classroom_id, self.s1.roll_no), ("11", self.room11.id, ""))
        self.assertEqual((self.s3.class_level, self.s3.classroom_id), ("10", self.room10_next.id))
        self.assertEqual(IDCard.objects.get(student=self.s1).valid_until, self.next_year.end_date)
        self.next_year.refresh_from_db(); self.a["year"].refresh_from_db()
        self.assertTrue(self.next_year.is_current)
        self.assertFalse(self.a["year"].is_current)
        # dobara same session me nahi
        again = self.client.post(self.URL, {**self.body(from_class_level="11", to_classroom=""), "decisions": [{"student": str(self.s1.id), "action": "promote"}]}, format="json")
        self.assertEqual(again.status_code, 400)
        history = self.client.get("/api/v1/students/promotions/")
        self.assertEqual(history.data[0]["total"], 3)
        undo = self.client.post("/api/v1/students/undo-promotion/", {"batch": res.data["batch"]}, format="json")
        self.assertEqual(undo.status_code, 200, undo.data)
        self.s1.refresh_from_db()
        self.assertEqual((self.s1.class_level, self.s1.classroom_id, self.s1.roll_no), ("10", self.a["room"].id, "RA1"))
        self.assertEqual(self.client.post("/api/v1/students/undo-promotion/", {"batch": res.data["batch"]}, format="json").status_code, 400)

    def test_capacity_and_wrong_class_rejected(self):
        body = self.body(decisions=[{"student": str(s.id), "action": "promote"} for s in (self.s1, self.s2, self.s3)])
        res = self.client.post(self.URL, body, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("seats", str(res.data))
        wrong = self.client.post(self.URL, self.body(to_classroom=str(self.room10_next.id)), format="json")
        self.assertIn("Class 11", str(wrong.data))
        self.s1.refresh_from_db()
        self.assertEqual(self.s1.class_level, "10")

    def test_class_12_pass_out(self):
        for s in (self.s1, self.s2, self.s3):
            s.class_level = "12"; s.save()
        bad = self.client.post(self.URL, self.body(from_class_level="12", to_classroom=""), format="json")
        self.assertEqual(bad.status_code, 400)
        ok = self.client.post(self.URL, self.body(from_class_level="12", to_classroom="", detain_classroom="", decisions=[{"student": str(self.s1.id), "action": "pass_out"}]), format="json")
        self.assertEqual(ok.status_code, 200, ok.data)
        self.s1.refresh_from_db()
        self.assertFalse(self.s1.is_active)
        self.assertFalse(IDCard.objects.get(student=self.s1).is_valid)

    def test_only_school_admin_and_own_school(self):
        teacher = make_teacher(self.a, 1)
        self.client.force_authenticate(teacher.user)
        self.assertEqual(self.client.post(self.URL, self.body(), format="json").status_code, 403)
        self.client.force_authenticate(self.b["admin"])
        res = self.client.post(self.URL, self.body(), format="json")
        self.assertEqual(res.status_code, 400)  # dusre school ka year/students nahi milte
        self.s1.refresh_from_db()
        self.assertEqual(self.s1.class_level, "10")


from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: E402
from django.test import override_settings  # noqa: E402

CSV_HEAD = "First name *,Last name,Admission no *,Class *,Section,Roll no,Date of birth,Gender,Father name *,Mother name *,Parent phone,Email,Password\n"


@override_settings(STUDENT_IMPORT_SYNC=True)
class BulkImportTests(APITestCase):
    URL = "/api/v1/students/import/"

    def setUp(self):
        cache.clear()
        self.a = make_school("ia")
        self.a["year"].is_current = True
        self.a["year"].save()
        self.client.force_authenticate(self.a["admin"])

    def upload(self, text, dry_run, name="students.csv"):
        f = SimpleUploadedFile(name, text.encode("utf-8"), content_type="text/csv")
        return self.client.post(self.URL, {"file": f, "dry_run": "true" if dry_run else "false"}, format="multipart")

    def test_template_downloads(self):
        from openpyxl import load_workbook
        res = self.client.get("/api/v1/students/import-template/")
        self.assertEqual(res.status_code, 200)
        wb = load_workbook(io.BytesIO(res.content))
        self.assertIn("Admission no *", [c.value for c in wb["Students"][1]])
        self.assertEqual(self.client.get("/api/v1/students/import-template/?type=csv").status_code, 200)

    def test_dry_run_reports_errors_and_saves_nothing(self):
        make_student(self.a, 1)  # admission A1 already exists
        body = CSV_HEAD + "Ravi,Kumar,A1,10,A,,15-08-2012,M,Ram,Sita,9876543210,,\n" + "Neha,,B2,15,,,,X,Anil,Pooja,123,,\n"
        res = self.upload(body, dry_run=True)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data["valid"], res.data["invalid"]), (0, 2))
        e1, e2 = res.data["errors"]
        self.assertIn("admission_no", e1["errors"])
        self.assertTrue({"class_level", "gender", "guardian_phone"} <= set(e2["errors"]))
        bad = self.upload(body, dry_run=False)
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(Student.objects.filter(school=self.a["school"]).count(), 1)

    def test_import_creates_students_logins_and_id_cards(self):
        body = CSV_HEAD + "Ravi,Kumar,2026001,X,a,7,15/08/2011,Male,Ram Kumar,Sita Devi,+91 98765 43210,,\n" + "Neha,Singh,2026002,Class 10,,,2011-01-02,F,Anil Singh,Pooja Singh,,neha@example.com,Strong-Pass-991\n"
        res = self.upload(body, dry_run=False)
        self.assertEqual(res.status_code, 202, res.data)
        self.assertEqual(res.data["job"]["status"], "done", res.data)
        ravi = Student.objects.get(admission_no="2026001")
        self.assertEqual((ravi.class_level, ravi.classroom_id, ravi.gender, ravi.guardian_phone, str(ravi.date_of_birth)), ("10", self.a["room"].id, "M", "9876543210", "2011-08-15"))
        self.assertTrue(ravi.user.email.endswith("@student.local"))
        self.assertTrue(IDCard.objects.filter(student=ravi).exists())
        creds = self.client.get(f"/api/v1/students/import-credentials/?job={res.data['job']['id']}")
        self.assertEqual(creds.status_code, 200)
        text = creds.content.decode("utf-8-sig")
        password = [line for line in text.splitlines() if "2026001" in line][0].split(",")[-1]
        login = self.client.post("/api/v1/auth/login/", {"email": ravi.user.email, "password": password}, format="json")
        self.assertEqual(login.status_code, 200, login.data)
        self.assertIn("(as given in file)", text)

    def test_xlsx_upload_and_permissions(self):
        from openpyxl import Workbook
        wb = Workbook()
        wb.active.append(["First name", "Admission no", "Class", "Father name", "Mother name", "Date of birth"])
        wb.active.append(["Kabir", 3001, 5, "Raj", "Rani", datetime.datetime(2017, 3, 4)])
        buf = io.BytesIO(); wb.save(buf)
        f = SimpleUploadedFile("s.xlsx", buf.getvalue())
        res = self.client.post(self.URL, {"file": f, "dry_run": "true"}, format="multipart")
        self.assertEqual(res.data["valid"], 1, res.data)
        self.assertEqual(res.data["preview"][0]["admission_no"], "3001")
        teacher = make_teacher(self.a, 1)
        self.client.force_authenticate(teacher.user)
        self.assertEqual(self.upload(CSV_HEAD, dry_run=True).status_code, 403)
