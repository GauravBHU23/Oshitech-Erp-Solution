from rest_framework import serializers

from apps.core.serializers import TenantSerializer

from .models import Attendance


class AttendanceSerializer(TenantSerializer):
    student_name = serializers.CharField(source="student.user.get_full_name", read_only=True)
    admission_no = serializers.CharField(source="student.admission_no", read_only=True)
    classroom_name = serializers.CharField(source="classroom.__str__", read_only=True)

    class Meta:
        model = Attendance
        fields = "__all__"
        read_only_fields = ["id", "school", "created_at", "updated_at", "marked_by"]


class AttendanceEntrySerializer(serializers.Serializer):
    student = serializers.UUIDField()
    status = serializers.ChoiceField(choices=Attendance.Status.choices)
    remarks = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class AttendanceMarkSerializer(serializers.Serializer):
    classroom = serializers.UUIDField()
    date = serializers.DateField()
    entries = AttendanceEntrySerializer(many=True, allow_empty=False)
