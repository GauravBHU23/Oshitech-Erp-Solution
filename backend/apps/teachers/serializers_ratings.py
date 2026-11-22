from rest_framework import serializers


class TeacherRatingSubmissionSerializer(serializers.Serializer):
    teacher_id = serializers.UUIDField()
    rating = serializers.IntegerField(min_value=1, max_value=5)
    feedback = serializers.CharField(required=False, allow_blank=True, max_length=2000)
