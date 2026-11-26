from django.conf import settings
import uuid
from django.http import FileResponse
from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from django.contrib.auth import authenticate
from django.contrib.auth.hashers import check_password
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import parsers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.academics.models import Course
from apps.core.audit import log_action
from apps.core.permissions import RoleAccess
from apps.core.roles import ADMIN_ONLY, Role
from apps.core.throttles import AtomicAnonRateThrottle
from apps.schools.models import School
from apps.students.models import Student
from apps.students.serializers import StudentSerializer
from apps.teachers.models import Teacher
from apps.teachers.serializers import TeacherSerializer
from apps.stre import security as captcha_security

from .authentication import enforce_csrf
from .sessions import create_session, revoke_session, revoke_user_sessions, session_is_active, touch_session
from .models import User, RegistrationRequest
from .serializers import LoginSerializer, PasswordChangeSerializer, UserSerializer, AccountDirectorySerializer, CreateTeacherProfileSerializer, SelfProfileUpdateSerializer, RegistrationRequestCreateSerializer, RegistrationRequestReadSerializer, validate_profile_photo_file

User = get_user_model()


class LoginRateThrottle(AtomicAnonRateThrottle):
    scope = "login"


def _set_cookies(response, access, refresh=None):
    common = dict(
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        domain=settings.AUTH_COOKIE_DOMAIN,
    )
    response.set_cookie(
        settings.AUTH_COOKIE_ACCESS, access, max_age=15 * 60, path="/", **common
    )
    if refresh:
        response.set_cookie(
            settings.AUTH_COOKIE_REFRESH,
            refresh,
            max_age=settings.SESSION_IDLE_MINUTES * 60,
            path=settings.AUTH_REFRESH_COOKIE_PATH,
            **common,
        )


def _session_info(refresh=None):
    info = {"idle_minutes": settings.SESSION_IDLE_MINUTES, "max_hours": settings.SESSION_MAX_HOURS}
    if refresh is not None and refresh.get("auth_time"):
        info["expires_at"] = int(refresh["auth_time"]) + settings.SESSION_MAX_HOURS * 3600
    return info


def _new_session(user):
    """Login: refresh token me login ka samay (12 ghante ki pakki seema ke liye)."""
    import time

    refresh = RefreshToken.for_user(user)
    refresh["auth_time"] = int(time.time())
    refresh["sid"] = uuid.uuid4().hex
    return refresh


def _issue_session(user):
    refresh = _new_session(user)
    create_session(user.pk, refresh["sid"])
    return refresh


def _clear_cookies(response):
    response.delete_cookie(settings.AUTH_COOKIE_ACCESS, path="/", domain=settings.AUTH_COOKIE_DOMAIN)
    response.delete_cookie(
        settings.AUTH_COOKIE_REFRESH,
        path=settings.AUTH_REFRESH_COOKIE_PATH,
        domain=settings.AUTH_COOKIE_DOMAIN,
    )


def _validate_password(password, user, field_name):
    try:
        password_validation.validate_password(password, user)
    except DjangoValidationError as exc:
        raise ValidationError({field_name: exc.messages}) from exc


def _revoke_user_refresh_tokens(user):
    revoke_user_sessions(user.pk)
    tokens = list(OutstandingToken.objects.filter(user=user))
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in tokens],
        ignore_conflicts=True,
    )


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Frontend pehle isko call kare taaki csrftoken cookie set ho jaye."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({"detail": "CSRF cookie set."})


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        enforce_csrf(request)
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        # CAPTCHA verification runs before looking up the account or checking
        # the password, so every login attempt follows the same challenge.
        captcha_security.check_captcha(
            s.validated_data["captcha_id"], s.validated_data["captcha"]
        )
        email = s.validated_data["email"].lower()
        password = s.validated_data["password"]

        existing = User.objects.filter(email=email).select_related("school").first()
        if existing and existing.is_locked:
            return Response(
                {"detail": "This account is temporarily locked. Please try again later."},
                status=status.HTTP_423_LOCKED,
            )

        user = authenticate(request, email=email, password=password)
        if user is None:
            if existing:
                if not existing.is_active and check_password(password, existing.password):
                    if existing.role == Role.STUDENT and Student.objects.filter(user=existing, is_active=False).exists():
                        return Response(
                            {"detail": "Your registration is approved. The school must assign your classroom and activate your profile before you can sign in."},
                            status=status.HTTP_403_FORBIDDEN,
                        )
                    if existing.role == Role.TEACHER and Teacher.objects.filter(user=existing, is_active=False).exists():
                        return Response(
                            {"detail": "Your registration is approved. The school must assign your classes and activate your profile before you can sign in."},
                            status=status.HTTP_403_FORBIDDEN,
                        )
                    return Response(
                        {"detail": "Portal login is disabled. Contact your school administrator."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                existing.register_failed_login()
            else:
                pending = RegistrationRequest.objects.filter(
                    email__iexact=email,
                    status=RegistrationRequest.Status.PENDING,
                ).only("password_hash").first()
                if pending and pending.password_hash and check_password(password, pending.password_hash):
                    return Response(
                        {"detail": "Your registration is waiting for school admin approval. You can sign in after your school approves it."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
            # Same message: attacker ko pata na chale ki email exist karta hai ya nahi
            return Response({"detail": "Invalid email or password."}, status=status.HTTP_401_UNAUTHORIZED)

        if user.school_id and not user.school.is_active:
            return Response({"detail": "This school account is inactive."}, status=status.HTTP_403_FORBIDDEN)

        user.reset_failed_logins()
        # Ek account, ek hi active session: naya login hote hi purane saare (kisi bhi
        # device/browser ke) sessions revoke ho jaate hain.
        _revoke_user_refresh_tokens(user)
        refresh = _issue_session(user)
        response = Response({"user": UserSerializer(user).data, "session": _session_info(refresh)})
        _set_cookies(response, str(refresh.access_token), str(refresh))
        return response


class LoginCaptchaView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginRateThrottle]

    def get(self, request):
        captcha, svg = captcha_security.new_captcha()
        return Response({"id": str(captcha.pk), "svg": svg})


class RefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        enforce_csrf(request)
        token = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if not token:
            return Response({"detail": "No refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        import time

        try:
            current = RefreshToken(token)
        except TokenError:
            response = Response({"detail": "Your session has expired. Please sign in again."}, status=status.HTTP_401_UNAUTHORIZED)
            _clear_cookies(response)
            return response
        auth_time = current.get("auth_time")
        if not auth_time or time.time() - int(auth_time) > settings.SESSION_MAX_HOURS * 3600:
            try:
                current.blacklist()
            except TokenError:
                pass
            response = Response({"detail": "Your session has ended. Please sign in again."}, status=status.HTTP_401_UNAUTHORIZED)
            _clear_cookies(response)
            return response
        if not session_is_active(current.get("user_id"), current.get("sid")):
            response = Response({"detail": "Your session has expired. Please sign in again."}, status=status.HTTP_401_UNAUTHORIZED)
            _clear_cookies(response)
            return response
        ser = TokenRefreshSerializer(data={"refresh": token})
        try:
            ser.is_valid(raise_exception=True)
        except TokenError:
            response = Response({"detail": "Invalid token."}, status=status.HTTP_401_UNAUTHORIZED)
            _clear_cookies(response)
            return response
        data = ser.validated_data
        touch_session(current.get("user_id"), current.get("sid"))
        response = Response({"detail": "refreshed", "session": _session_info(current)})
        _set_cookies(response, data["access"], data.get("refresh"))
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        enforce_csrf(request)
        token = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if token:
            try:
                refresh = RefreshToken(token)
                refresh.blacklist()
                revoke_session(refresh.get("user_id"), refresh.get("sid"))
            except TokenError:
                pass
        access = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)
        if access:
            try:
                access_token = AccessToken(access)
                revoke_session(access_token.get("user_id"), access_token.get("sid"))
            except TokenError:
                pass
        response = Response({"detail": "Logged out."})
        _clear_cookies(response)
        return response


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        current_password = serializer.validated_data["current_password"]
        new_password = serializer.validated_data["new_password"]

        if not user.check_password(current_password):
            raise ValidationError({"current_password": "Current password is incorrect."})
        if user.check_password(new_password):
            raise ValidationError({"new_password": "Choose a password different from your current password."})
        _validate_password(new_password, user, "new_password")

        with transaction.atomic():
            user.set_password(new_password)
            user.save(update_fields=["password"])
            _revoke_user_refresh_tokens(user)
            refresh = _issue_session(user)
            log_action(request, "account_password_changed", user, {"role": user.role})

        response = Response({"detail": "Password updated. Other signed-in sessions have been revoked."})
        _set_cookies(response, str(refresh.access_token), str(refresh))
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = UserSerializer(request.user).data
        data["session"] = _session_info()
        return Response(data)


class AccountDirectoryView(APIView):
    permission_classes = [IsAuthenticated, RoleAccess]

    def get_allowed_roles(self, request):
        return ADMIN_ONLY

    def get(self, request):
        queryset = User.objects.select_related("school", "student_profile__classroom__course", "student_profile__classroom__academic_year", "teacher_profile").prefetch_related("teacher_profile__assignments__classroom__course", "teacher_profile__assignments__classroom__academic_year", "teacher_profile__assignments__subject").order_by("role", "first_name", "last_name", "email")
        if request.user.role != Role.SUPER_ADMIN:
            queryset = queryset.filter(school_id=request.user.school_id)
        role_counts = dict(queryset.order_by().values("role").annotate(total=Count("id")).values_list("role", "total"))
        search = request.query_params.get("search", "").strip()
        role = request.query_params.get("role", "").strip()
        if search:
            queryset = queryset.filter(Q(email__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search) | Q(phone__icontains=search))
        if role in Role.values:
            queryset = queryset.filter(role=role)
        paginator = PageNumberPagination()
        paginator.page_size = 100
        page = paginator.paginate_queryset(queryset, request, view=self)
        response = paginator.get_paginated_response(AccountDirectorySerializer(page, many=True).data)
        response.data["role_counts"] = role_counts
        return response


class AccountManagementView(APIView):
    permission_classes = [IsAuthenticated, RoleAccess]

    def get_allowed_roles(self, request):
        return ADMIN_ONLY

    def get_target(self, request, user_id):
        queryset = User.objects.select_related("school")
        if request.user.role != Role.SUPER_ADMIN:
            queryset = queryset.filter(school_id=request.user.school_id)
        target = get_object_or_404(queryset, pk=user_id)
        if target.role == Role.SUPER_ADMIN and request.user.role != Role.SUPER_ADMIN:
            raise PermissionDenied("Only a platform Super Admin can manage this account.")
        if target.pk == request.user.pk:
            raise PermissionDenied("You cannot block or delete your own account.")
        return target

    def patch(self, request, user_id):
        target = self.get_target(request, user_id)
        common_fields = {"email", "first_name", "last_name", "phone"}
        profile_fields = {
            Role.STUDENT: {"admission_no", "roll_no", "class_level", "classroom", "date_of_birth", "gender", "father_name", "mother_name", "guardian_phone", "blood_group", "address", "is_active"},
            Role.TEACHER: {"employee_id", "phone", "qualification", "joining_date", "is_public", "is_active"},
        }.get(target.role, set())
        allowed_fields = common_fields | profile_fields | {"profile_photo"}
        unknown = set(request.data.keys()) - allowed_fields
        if unknown:
            raise ValidationError({field: "This field cannot be changed here." for field in sorted(unknown)})
        if "email" in request.data:
            email = str(request.data["email"]).strip().lower()
            if User.objects.filter(email__iexact=email).exclude(pk=target.pk).exists():
                raise ValidationError({"email": "An account with this email already exists."})
        clean_phone = ""
        if "phone" in request.data:
            # Kuch bhi save karne se pehle phone check karo (aadha update na ho)
            from apps.core.validators import normalize_mobile
            from rest_framework import serializers as drf_serializers
            try:
                clean_phone = normalize_mobile(str(request.data["phone"]))
            except drf_serializers.ValidationError as exc:
                raise ValidationError({"phone": exc.detail}) from exc

        profile = None
        profile_serializer_class = None
        if target.role == Role.STUDENT:
            profile = Student.objects.filter(user=target).first()
            profile_serializer_class = StudentSerializer
        elif target.role == Role.TEACHER:
            profile = Teacher.objects.filter(user=target).first()
            profile_serializer_class = TeacherSerializer

        if profile and profile_serializer_class:
            profile_data = {key: value for key, value in request.data.items() if key in (common_fields | profile_fields)}
            serializer = profile_serializer_class(profile, data=profile_data, partial=True, context={"request": request})
            serializer.is_valid(raise_exception=True)
            serializer.save()
        else:
            for field in ("email", "first_name", "last_name"):
                if field in request.data:
                    setattr(target, field, str(request.data[field]).strip())
            target.save()

        if "phone" in request.data:
            target.phone = clean_phone
            target.save(update_fields=["phone"])
            if target.role == Role.TEACHER and profile:
                profile.phone = target.phone
                profile.save(update_fields=["phone", "updated_at"])
        if "profile_photo" in request.data:
            photo = validate_profile_photo_file(request.data["profile_photo"])
            old_photo = target.profile_photo
            target.profile_photo = photo
            target.save(update_fields=["profile_photo"])
            if old_photo:
                old_photo.delete(save=False)
        log_action(request, "account_updated", target, {"fields": sorted(request.data.keys())})
        return Response(AccountDirectorySerializer(target).data)

    def delete(self, request, user_id):
        target = self.get_target(request, user_id)
        if target.role == Role.SCHOOL_ADMIN and request.user.role != Role.SUPER_ADMIN:
            raise PermissionDenied("Only a platform Super Admin can delete a school administrator account.")
        log_action(request, "account_deleted", target, {"role": target.role, "email": target.email})
        target.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AccountManagementActionView(APIView):
    permission_classes = [IsAuthenticated, RoleAccess]

    def get_allowed_roles(self, request):
        return ADMIN_ONLY

    def post(self, request, user_id, action_name):
        manager = AccountManagementView()
        target = manager.get_target(request, user_id)
        if action_name == "create-teacher-profile":
            if target.role != Role.TEACHER:
                raise ValidationError({"role": "Only teacher accounts can have a teacher profile."})
            if not target.school_id:
                raise ValidationError({"school": "Link this account to a school before creating its teacher profile."})
            if Teacher.objects.filter(user=target).exists():
                raise ValidationError({"detail": "This account already has a teacher profile."})
            serializer = CreateTeacherProfileSerializer(
                data=request.data,
                context={"school_id": target.school_id},
            )
            serializer.is_valid(raise_exception=True)
            with transaction.atomic():
                profile = Teacher.objects.create(
                    user=target,
                    school=target.school,
                    phone=target.phone,
                    is_active=False,
                    **serializer.validated_data,
                )
                log_action(request, "teacher_profile_created", profile)
            return Response(AccountDirectorySerializer(target).data, status=status.HTTP_201_CREATED)
        if action_name in {"block", "unblock"}:
            if target.role == Role.SCHOOL_ADMIN and request.user.role != Role.SUPER_ADMIN:
                raise PermissionDenied("Only a platform Super Admin can change a school administrator's account status.")
            blocked = action_name == "block"
            if target.is_active == (not blocked):
                return Response({"detail": "The account is already in this status."})
            target.is_active = not blocked
            target.save(update_fields=["is_active"])
            log_action(request, "account_blocked" if blocked else "account_unblocked", target, {"role": target.role})
            return Response({"detail": "Portal access blocked." if blocked else "Portal access restored."})
        if action_name == "reset-password":
            if target.role == Role.SCHOOL_ADMIN and request.user.role != Role.SUPER_ADMIN:
                raise PermissionDenied("Only a platform Super Admin can reset a school administrator's password.")
            password = request.data.get("password", "")
            if not password:
                raise ValidationError({"password": "A temporary password is required."})
            _validate_password(password, target, "password")
            with transaction.atomic():
                target.set_password(password)
                target.save(update_fields=["password"])
                _revoke_user_refresh_tokens(target)
                log_action(request, "account_password_reset", target, {"role": target.role})
            return Response({"detail": "Password reset. Share the temporary password securely."})
        raise ValidationError({"action": "Invalid account action."})


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [parsers.JSONParser, parsers.MultiPartParser, parsers.FormParser]

    def _data(self, user):
        data = UserSerializer(user).data
        teacher = Teacher.objects.filter(user=user).first() if user.role == Role.TEACHER else None
        data["qualification"] = teacher.qualification if teacher else ""
        data["is_public"] = teacher.is_public if teacher else False
        return data

    def get(self, request):
        return Response(self._data(request.user))

    def patch(self, request):
        serializer = SelfProfileUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        user = request.user
        old_photo = user.profile_photo
        for field in ("first_name", "last_name", "phone"):
            if field in values:
                setattr(user, field, values[field])
        if "profile_photo" in values:
            user.profile_photo = values["profile_photo"]
        user.save()
        if "profile_photo" in values and old_photo:
            old_photo.delete(save=False)
        if user.role == Role.TEACHER:
            teacher = Teacher.objects.filter(user=user).first()
            if teacher:
                if "phone" in values:
                    teacher.phone = values["phone"]
                if "qualification" in values:
                    teacher.qualification = values["qualification"]
                if "is_public" in values:
                    teacher.is_public = values["is_public"]
                teacher.save()
        log_action(request, "profile_updated", user, {"fields": sorted(values.keys())})
        return Response(self._data(user))


class ProfilePhotoView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        user = get_object_or_404(User.objects.select_related("school"), pk=user_id)
        is_owner = request.user.pk == user.pk
        is_super_admin = request.user.role == Role.SUPER_ADMIN
        is_school_admin = request.user.role == Role.SCHOOL_ADMIN and request.user.school_id == user.school_id
        is_exam_controller = request.user.role == Role.EXAM_CONTROLLER and request.user.school_id == user.school_id
        is_teacher_of_student = (
            request.user.role == Role.TEACHER
            and request.user.school_id == user.school_id
            and user.role == Role.STUDENT
            and Student.objects.filter(user=user).filter(
                Q(classroom__class_teacher__user=request.user) | Q(classroom__assignments__teacher__user=request.user)
            ).exists()
        )
        if not user.profile_photo or not (is_owner or is_super_admin or is_school_admin or is_exam_controller or is_teacher_of_student):
            return Response(status=status.HTTP_404_NOT_FOUND)
        extension = user.profile_photo.name.rsplit(".", 1)[-1].lower()
        content_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}.get(extension, "application/octet-stream")
        return FileResponse(user.profile_photo.open("rb"), content_type=content_type)


class RegistrationPhotoView(APIView):
    permission_classes = [IsAuthenticated, RoleAccess]

    def get_allowed_roles(self, request):
        return ADMIN_ONLY

    def get(self, request, registration_id):
        application = get_object_or_404(RegistrationRequest, pk=registration_id)
        if request.user.role != Role.SUPER_ADMIN and request.user.school_id != application.school_id:
            raise PermissionDenied("You do not have permission to view this application photo.")
        if not application.profile_photo:
            return Response(status=status.HTTP_404_NOT_FOUND)
        extension = application.profile_photo.name.rsplit(".", 1)[-1].lower()
        content_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}.get(extension, "application/octet-stream")
        return FileResponse(application.profile_photo.open("rb"), content_type=content_type)


class RegistrationOptionsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AtomicAnonRateThrottle]

    def get(self, request):
        code = request.query_params.get("school_code", "").strip()
        school = School.objects.filter(code__iexact=code, is_active=True).first()
        if not school:
            return Response({"detail": "Enter a valid code for an active school."}, status=status.HTTP_404_NOT_FOUND)
        from apps.academics.models import AcademicYear
        return Response({"school": {"name": school.name, "code": school.code}, "courses": list(Course.objects.filter(school=school, is_active=True).values("id", "name", "code")), "academic_years": list(AcademicYear.objects.filter(school=school).values("id", "name"))})


class RegistrationCreateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AtomicAnonRateThrottle]
    parser_classes = [parsers.JSONParser, parsers.MultiPartParser, parsers.FormParser]

    def post(self, request):
        serializer = RegistrationRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        application = serializer.save()
        log_action(request, "registration_submitted", application, {"role": application.role})
        return Response({"id": str(application.pk), "detail": "Registration submitted. Your account will be activated after school administrator approval."}, status=status.HTTP_201_CREATED)


class RegistrationRequestViewSet(viewsets.ModelViewSet):
    queryset = RegistrationRequest.objects.select_related("school", "reviewed_by")
    serializer_class = RegistrationRequestReadSerializer
    permission_classes = [IsAuthenticated, RoleAccess]
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["status", "role"]

    def get_allowed_roles(self, request):
        return ADMIN_ONLY

    def get_queryset(self):
        qs = self.queryset
        if self.request.user.role == Role.SUPER_ADMIN:
            return qs
        return qs.filter(school_id=self.request.user.school_id)

    def create(self, request, *args, **kwargs):
        raise PermissionDenied("Registration requests cannot be submitted through this endpoint.")

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        application = self.get_object()
        if application.status != RegistrationRequest.Status.PENDING:
            raise ValidationError("This registration has already been reviewed.")
        details = application.details
        try:
            with transaction.atomic():
                user = User(email=application.email, first_name=application.first_name, last_name=application.last_name, phone=application.phone, role=application.role, school=application.school, is_active=False)
                user.password = application.password_hash
                user.save()
                if application.profile_photo:
                    application.profile_photo.open("rb")
                    user.profile_photo = ContentFile(application.profile_photo.read(), name=application.profile_photo.name.rsplit("/", 1)[-1])
                    user.save(update_fields=["profile_photo"])
                if application.role == Role.STUDENT:
                    Student.objects.create(school=application.school, user=user, admission_no=f"REG-{str(application.pk)[:8].upper()}", class_level=details["class_level"], date_of_birth=details["date_of_birth"], gender=details.get("gender", ""), father_name=details.get("father_name") or details.get("guardian_name", ""), mother_name=details.get("mother_name", ""), guardian_phone=details["guardian_phone"], address=details["address"], is_active=False)
                else:
                    Teacher.objects.create(school=application.school, user=user, employee_id=f"REG-{str(application.pk)[:8].upper()}", phone=application.phone, qualification=details["qualification"], is_active=False)
                # Keep Aadhaar only while an application is pending review.
                details.pop("aadhaar_encrypted", None)
                application.details = details
                application.status = RegistrationRequest.Status.APPROVED
                application.reviewed_by = request.user
                application.reviewed_at = timezone.now()
                application.password_hash = ""
                application.save(update_fields=["status", "reviewed_by", "reviewed_at", "password_hash", "details"])
                if application.profile_photo:
                    application.profile_photo.delete(save=True)
        except IntegrityError as exc:
            raise ValidationError("An account or profile already exists. Contact your school administrator.") from exc
        log_action(request, "registration_approved", application, {"role": application.role, "email": application.email})
        return Response({"detail": "Registration approved. Assign a class or teaching responsibilities to activate the profile."})

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        application = self.get_object()
        if application.status != RegistrationRequest.Status.PENDING:
            raise ValidationError("This registration has already been reviewed.")
        application.status = RegistrationRequest.Status.REJECTED
        application.reviewed_by = request.user
        application.reviewed_at = timezone.now()
        application.password_hash = ""
        application.details = {}
        application.save(update_fields=["status", "reviewed_by", "reviewed_at", "password_hash", "details"])
        if application.profile_photo:
            application.profile_photo.delete(save=True)
        log_action(request, "registration_rejected", application, {"role": application.role, "email": application.email})
        return Response({"detail": "Registration rejected."})
