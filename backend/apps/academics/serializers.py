from rest_framework import serializers

from apps.core.serializers import TenantSerializer

from .models import AcademicYear, ClassRoom, Course, Subject, TeachingAssignment

RO = ["id", "school", "created_at", "updated_at"]


def _full_name(user):
    return (user.get_full_name() or user.email) if user else ""


class AcademicYearSerializer(TenantSerializer):
    class Meta:
        model = AcademicYear
        fields = "__all__"
        read_only_fields = RO

    def validate(self, attrs):
        attrs = super().validate(attrs)
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end <= start:
            raise serializers.ValidationError("The end date must be after the start date.")
        return attrs

    def save(self, **kwargs):
        instance = super().save(**kwargs)
        if instance.is_current:
            # Ek school me sirf ek current academic year
            AcademicYear.objects.filter(school_id=instance.school_id, is_current=True).exclude(pk=instance.pk).update(
                is_current=False
            )
        return instance


class CourseSerializer(TenantSerializer):
    subject_count = serializers.IntegerField(source="subjects.count", read_only=True)

    class Meta:
        model = Course
        fields = "__all__"
        read_only_fields = RO


class SubjectSerializer(TenantSerializer):
    course_name = serializers.CharField(source="course.name", read_only=True)

    class Meta:
        model = Subject
        fields = "__all__"
        read_only_fields = RO


class ClassRoomSerializer(TenantSerializer):
    course_name = serializers.CharField(source="course.name", read_only=True)
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)
    class_teacher_name = serializers.SerializerMethodField()
    student_count = serializers.IntegerField(source="students.count", read_only=True)

    class Meta:
        model = ClassRoom
        fields = "__all__"
        read_only_fields = RO

    def get_class_teacher_name(self, obj):
        return _full_name(obj.class_teacher.user) if obj.class_teacher_id else ""


class TeachingAssignmentSerializer(TenantSerializer):
    teacher_name = serializers.SerializerMethodField()
    classroom_name = serializers.CharField(source="classroom.__str__", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)

    class Meta:
        model = TeachingAssignment
        fields = "__all__"
        read_only_fields = RO

    def get_teacher_name(self, obj):
        return _full_name(obj.teacher.user)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        classroom = attrs.get("classroom", getattr(self.instance, "classroom", None))
        subject = attrs.get("subject", getattr(self.instance, "subject", None))
        if classroom and subject and subject.course_id != classroom.course_id:
            raise serializers.ValidationError({"subject": "This subject does not belong to the classroom's course."})
        return attrs
