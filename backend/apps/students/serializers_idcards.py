from rest_framework import serializers

from .models import IDCard


class IDCardSerializer(serializers.ModelSerializer):
    holder_name = serializers.SerializerMethodField()
    holder_photo = serializers.SerializerMethodField()
    reference_no = serializers.SerializerMethodField()
    details = serializers.SerializerMethodField()
    is_valid = serializers.BooleanField(read_only=True)
    school_name = serializers.CharField(source="school.name", read_only=True)
    school_code = serializers.CharField(source="school.code", read_only=True)
    school_address = serializers.SerializerMethodField()
    school_phone = serializers.CharField(source="school.phone", read_only=True)
    school_email = serializers.CharField(source="school.email", read_only=True)

    class Meta:
        model = IDCard
        fields = [
            "id", "holder_type", "student", "teacher", "code", "issued_on", "valid_until", "is_revoked",
            "is_valid", "holder_name", "holder_photo", "reference_no", "details", "school", "school_name",
            "school_code", "school_address", "school_phone", "school_email", "created_at",
        ]
        read_only_fields = fields

    def get_holder_name(self, obj):
        holder = obj.holder
        if not holder:
            return ""
        return holder.user.get_full_name() or holder.user.email

    def get_holder_photo(self, obj):
        holder = obj.holder
        if holder and holder.user.profile_photo:
            return f"/api/v1/auth/profile-photos/{holder.user_id}/"
        return None

    def get_reference_no(self, obj):
        holder = obj.holder
        if not holder:
            return ""
        return holder.admission_no if obj.holder_type == IDCard.Holder.STUDENT else holder.employee_id

    def get_school_address(self, obj):
        school = obj.school
        return ", ".join(part for part in [school.address, school.city, school.state, school.pincode] if part)

    def get_details(self, obj):
        holder = obj.holder
        if not holder:
            return {}
        if obj.holder_type == IDCard.Holder.STUDENT:
            classroom = holder.classroom
            return {
                "class_level": holder.class_level,
                "classroom": str(classroom) if classroom else "",
                "section": classroom.section if classroom else "",
                "roll_no": holder.roll_no,
                "date_of_birth": holder.date_of_birth,
                "blood_group": holder.blood_group,
                "father_name": holder.father_name,
                "mother_name": holder.mother_name,
                "guardian_phone": holder.guardian_phone,
                "address": holder.address,
            }
        return {
            "designation": "Teacher",
            "qualification": holder.qualification,
            "phone": holder.phone or holder.user.phone,
            "joining_date": holder.joining_date,
            "email": holder.user.email,
        }
