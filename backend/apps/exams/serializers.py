from rest_framework import serializers

from apps.core.serializers import TenantSerializer

from .models import AdmitCard, Exam, ExamSchedule, Result

RO = ["id", "school", "created_at", "updated_at"]


class ExamSerializer(TenantSerializer):
    course_name = serializers.CharField(source="course.name", read_only=True)
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)

    class Meta:
        model = Exam
        fields = "__all__"
        read_only_fields = RO + ["results_published", "results_locked"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError("The end date must be on or after the start date.")
        return attrs


class ExamScheduleSerializer(TenantSerializer):
    exam_name = serializers.CharField(source="exam.name", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)

    class Meta:
        model = ExamSchedule
        fields = "__all__"
        read_only_fields = RO

    def validate(self, attrs):
        attrs = super().validate(attrs)
        mx = attrs.get("max_marks", getattr(self.instance, "max_marks", 100))
        pm = attrs.get("pass_marks", getattr(self.instance, "pass_marks", 0))
        if pm > mx:
            raise serializers.ValidationError("Pass marks cannot exceed maximum marks.")
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"end_time": "The end time must be after the start time."})
        exam = attrs.get("exam") or self.instance.exam
        subject = attrs.get("subject", getattr(self.instance, "subject", None))
        if subject is not None and subject.course_id != exam.course_id:
            raise serializers.ValidationError({"subject": "This subject does not belong to the exam's course."})
        day = attrs.get("date", getattr(self.instance, "date", None))
        if day and not (exam.start_date <= day <= exam.end_date):
            raise serializers.ValidationError({"date": "The paper date must fall within the exam's start and end dates."})
        if exam.results_locked:
            raise serializers.ValidationError("The exam schedule cannot be changed while results are locked.")
        return attrs


class AdmitCardSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.user.get_full_name", read_only=True)
    admission_no = serializers.CharField(source="student.admission_no", read_only=True)
    roll_no = serializers.CharField(source="student.roll_no", read_only=True)
    class_level = serializers.CharField(source="student.class_level", read_only=True)
    father_name = serializers.CharField(source="student.father_name", read_only=True)
    mother_name = serializers.CharField(source="student.mother_name", read_only=True)
    date_of_birth = serializers.DateField(source="student.date_of_birth", read_only=True, allow_null=True)
    student_photo = serializers.SerializerMethodField()
    exam_name = serializers.CharField(source="exam.name", read_only=True)
    exam_start_date = serializers.DateField(source="exam.start_date", read_only=True)
    exam_end_date = serializers.DateField(source="exam.end_date", read_only=True)
    course_name = serializers.CharField(source="exam.course.name", read_only=True)
    academic_year_name = serializers.CharField(source="exam.academic_year.name", read_only=True)
    school_name = serializers.CharField(source="school.name", read_only=True)
    school_code = serializers.CharField(source="school.code", read_only=True)
    school_address = serializers.CharField(source="school.address", read_only=True)
    school_city = serializers.CharField(source="school.city", read_only=True)
    school_state = serializers.CharField(source="school.state", read_only=True)
    school_phone = serializers.CharField(source="school.phone", read_only=True)

    def get_student_photo(self, obj):
        if not obj.student.user.profile_photo:
            return None
        return f"/api/v1/auth/profile-photos/{obj.student.user_id}/"

    class Meta:
        model = AdmitCard
        fields = [
            "id", "exam", "exam_name", "exam_start_date", "exam_end_date", "course_name",
            "academic_year_name", "school_name", "school_code", "school_address", "school_city",
            "school_state", "school_phone", "student", "student_name", "student_photo",
            "admission_no", "roll_no", "class_level", "father_name", "mother_name", "date_of_birth",
            "code", "is_revoked", "created_at",
        ]
        read_only_fields = fields


class ResultSerializer(TenantSerializer):
    exam_name = serializers.CharField(source="exam.name", read_only=True)
    student_name = serializers.CharField(source="student.user.get_full_name", read_only=True)
    admission_no = serializers.CharField(source="student.admission_no", read_only=True)
    roll_no = serializers.CharField(source="student.roll_no", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    max_marks = serializers.SerializerMethodField()
    pass_marks = serializers.SerializerMethodField()

    class Meta:
        model = Result
        fields = "__all__"
        read_only_fields = RO

    def _schedule(self, obj):
        cache = self.context.setdefault("_schedule_cache", {})
        key = (obj.exam_id, obj.subject_id)
        if key not in cache:
            cache[key] = ExamSchedule.objects.filter(exam_id=obj.exam_id, subject_id=obj.subject_id).first()
        return cache[key]

    def get_max_marks(self, obj):
        schedule = self._schedule(obj)
        return schedule.max_marks if schedule else None

    def get_pass_marks(self, obj):
        schedule = self._schedule(obj)
        return schedule.pass_marks if schedule else None

    def validate(self, attrs):
        attrs = super().validate(attrs)
        inst = self.instance
        if inst:
            for f in ("exam", "student", "subject"):
                if f in attrs and attrs[f] != getattr(inst, f):
                    raise serializers.ValidationError({f: "This field cannot be changed after creation."})
        exam = attrs.get("exam") or inst.exam
        student = attrs.get("student") or inst.student
        subject = attrs.get("subject") or inst.subject
        if exam.results_locked:
            raise serializers.ValidationError("Results are locked. An Exam Controller or administrator must unlock them first.")
        request = self.context.get("request")
        if request and request.user.role == "teacher":
            from apps.academics.models import TeachingAssignment
            allowed = TeachingAssignment.objects.filter(
                teacher__user=request.user,
                classroom__course=exam.course,
                classroom__academic_year=exam.academic_year,
                subject=subject,
            ).exists()
            if not allowed:
                raise serializers.ValidationError("You are not assigned to enter marks for this subject.")
            if not TeachingAssignment.objects.filter(
                teacher__user=request.user,
                classroom__course=exam.course,
                classroom__academic_year=exam.academic_year,
                classroom__students__id=student.id,
                subject=subject,
            ).exists():
                raise serializers.ValidationError({"student": "This student is not in your assigned class."})
        if student.school_id != exam.school_id:
            raise serializers.ValidationError({"student": "Invalid reference."})
        if student.classroom_id is None or (
            student.classroom.course_id != exam.course_id or student.classroom.academic_year_id != exam.academic_year_id
        ):
            raise serializers.ValidationError({"student": "This student is not enrolled in the exam's course and year."})
        schedule = ExamSchedule.objects.filter(exam=exam, subject=subject).first()
        if schedule is None:
            raise serializers.ValidationError({"subject": "This subject is not scheduled for the selected exam."})
        absent = attrs.get("is_absent", getattr(inst, "is_absent", False))
        marks = attrs.get("marks_obtained", getattr(inst, "marks_obtained", None))
        if absent:
            attrs["marks_obtained"] = None
        elif marks is None:
            raise serializers.ValidationError({"marks_obtained": "Enter the marks or mark the student as absent."})
        elif marks < 0 or marks > schedule.max_marks:
            raise serializers.ValidationError({"marks_obtained": f"Marks must be between 0 and {schedule.max_marks}."})
        return attrs


class BulkResultEntrySerializer(serializers.Serializer):
    student = serializers.UUIDField()
    marks_obtained = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    is_absent = serializers.BooleanField(required=False, default=False)
    remarks = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class BulkResultSerializer(serializers.Serializer):
    exam = serializers.UUIDField()
    subject = serializers.UUIDField()
    entries = BulkResultEntrySerializer(many=True, allow_empty=False)
