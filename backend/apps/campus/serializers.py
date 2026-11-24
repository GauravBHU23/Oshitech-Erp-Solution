from rest_framework import serializers

from apps.core.roles import Role
from apps.core.serializers import PdfAttachmentMixin, TenantSerializer

from .models import FeeInvoice, FeePayment, FeeStructure, Homework, LeaveRequest, Notice, TimetableEntry

RO = ["id", "school", "created_at", "updated_at"]
CLASS_CHOICES = [("", "All classes")] + [(str(n), f"Class {n}") for n in range(1, 13)]


def _name(user):
    return (user.get_full_name() or user.email) if user else ""


def _check_dates(attrs, instance, start, end, message):
    a = attrs.get(start, getattr(instance, start, None))
    b = attrs.get(end, getattr(instance, end, None))
    if a and b and b < a:
        raise serializers.ValidationError({end: message})


class NoticeSerializer(PdfAttachmentMixin, TenantSerializer):
    attachment_path = "/api/v1/notice-files/{id}/"
    class_level = serializers.ChoiceField(choices=CLASS_CHOICES, required=False, allow_blank=True)
    published_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Notice
        fields = "__all__"
        read_only_fields = RO + ["published_by"]

    def get_published_by_name(self, obj):
        return _name(obj.published_by)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        _check_dates(attrs, self.instance, "event_date", "end_date", "The end date must be on or after the event date.")
        _check_dates(attrs, self.instance, "publish_on", "expires_on", "The expiry date must be on or after the publish date.")
        return attrs


class TimetableEntrySerializer(TenantSerializer):
    classroom_name = serializers.CharField(source="classroom.__str__", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    teacher_name = serializers.SerializerMethodField()
    day_name = serializers.CharField(source="get_day_display", read_only=True)

    class Meta:
        model = TimetableEntry
        fields = "__all__"
        read_only_fields = RO

    def get_teacher_name(self, obj):
        return _name(obj.teacher.user) if obj.teacher_id else ""

    def validate(self, attrs):
        attrs = super().validate(attrs)
        inst = self.instance
        get = lambda f: attrs.get(f, getattr(inst, f, None))  # noqa: E731
        start, end = get("start_time"), get("end_time")
        if start and end and end <= start:
            raise serializers.ValidationError({"end_time": "The end time must be after the start time."})
        classroom, subject, teacher, day = get("classroom"), get("subject"), get("teacher"), get("day")
        if classroom and subject and subject.course_id != classroom.course_id:
            raise serializers.ValidationError({"subject": "This subject does not belong to the classroom's course."})
        if teacher and day and start and end:
            clash = TimetableEntry.objects.filter(teacher=teacher, day=day, start_time__lt=end, end_time__gt=start)
            if inst:
                clash = clash.exclude(pk=inst.pk)
            if clash.exists():
                raise serializers.ValidationError({"teacher": "This teacher already has a class at this time."})
        return attrs


class HomeworkSerializer(TenantSerializer):
    classroom_name = serializers.CharField(source="classroom.__str__", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    assigned_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Homework
        fields = "__all__"
        read_only_fields = RO + ["assigned_by"]

    def get_assigned_by_name(self, obj):
        return _name(obj.assigned_by)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        _check_dates(attrs, self.instance, "assigned_on", "due_date", "The due date must be on or after the assigned date.")
        classroom = attrs.get("classroom", getattr(self.instance, "classroom", None))
        subject = attrs.get("subject", getattr(self.instance, "subject", None))
        if classroom and subject and subject.course_id != classroom.course_id:
            raise serializers.ValidationError({"subject": "This subject does not belong to the classroom's course."})
        user = self.context["request"].user
        if user.role == Role.TEACHER and classroom is not None:
            from apps.academics.models import TeachingAssignment
            ok = classroom.class_teacher and classroom.class_teacher.user_id == user.pk
            ok = ok or TeachingAssignment.objects.filter(classroom=classroom, teacher__user=user).exists()
            if not ok:
                raise serializers.ValidationError({"classroom": "You can only give homework to classes you teach."})
        return attrs


class LeaveRequestSerializer(TenantSerializer):
    applicant_name = serializers.SerializerMethodField()
    student_class = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    days = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        fields = "__all__"
        read_only_fields = RO + ["applicant", "applicant_role", "student", "status", "reviewed_by", "reviewed_at", "review_note"]

    def get_applicant_name(self, obj):
        return _name(obj.applicant)

    def get_reviewed_by_name(self, obj):
        return _name(obj.reviewed_by)

    def get_student_class(self, obj):
        return str(obj.student.classroom) if obj.student_id and obj.student.classroom_id else ""

    def get_days(self, obj):
        return (obj.to_date - obj.from_date).days + 1

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance and self.instance.status != LeaveRequest.Status.PENDING:
            raise serializers.ValidationError("A reviewed leave request cannot be changed.")
        _check_dates(attrs, self.instance, "from_date", "to_date", "The end date must be on or after the start date.")
        return attrs


class FeeStructureSerializer(TenantSerializer):
    class_level = serializers.ChoiceField(choices=CLASS_CHOICES, required=False, allow_blank=True)
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True, default="")
    invoice_count = serializers.IntegerField(source="invoices.count", read_only=True)

    class Meta:
        model = FeeStructure
        fields = "__all__"
        read_only_fields = RO

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value


class FeeInvoiceSerializer(TenantSerializer):
    student_name = serializers.CharField(source="student.user.get_full_name", read_only=True)
    admission_no = serializers.CharField(source="student.admission_no", read_only=True)
    class_level = serializers.CharField(source="student.class_level", read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    paid = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    status = serializers.CharField(read_only=True)

    class Meta:
        model = FeeInvoice
        fields = "__all__"
        read_only_fields = RO + ["invoice_no", "fee_structure"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        amount = attrs.get("amount", getattr(self.instance, "amount", 0)) or 0
        discount = attrs.get("discount", getattr(self.instance, "discount", 0)) or 0
        if amount <= 0:
            raise serializers.ValidationError({"amount": "Amount must be greater than zero."})
        if discount < 0 or discount > amount:
            raise serializers.ValidationError({"discount": "Discount must be between 0 and the amount."})
        return attrs


class FeePaymentSerializer(TenantSerializer):
    invoice_no = serializers.CharField(source="invoice.invoice_no", read_only=True)
    invoice_title = serializers.CharField(source="invoice.title", read_only=True)
    student_name = serializers.CharField(source="invoice.student.user.get_full_name", read_only=True)
    admission_no = serializers.CharField(source="invoice.student.admission_no", read_only=True)
    received_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FeePayment
        fields = "__all__"
        read_only_fields = RO + ["receipt_no", "received_by"]

    def get_received_by_name(self, obj):
        return _name(obj.received_by)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is not None:
            raise serializers.ValidationError("Payments cannot be edited. Delete and record it again.")
        amount = attrs["amount"]
        if amount <= 0:
            raise serializers.ValidationError({"amount": "Amount must be greater than zero."})
        balance = attrs["invoice"].balance
        if amount > balance:
            raise serializers.ValidationError({"amount": f"Amount is more than the balance due ({balance})."})
        return attrs
