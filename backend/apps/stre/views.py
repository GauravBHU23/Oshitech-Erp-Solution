import csv
import datetime
import logging
import re

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, ProtectedError, Q, Sum
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import parsers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalCookieJWTAuthentication

from apps.core.audit import log_action
from apps.core.roles import Role
from apps.core.throttles import AtomicAnonRateThrottle, AtomicScopedRateThrottle

from . import emails, payments, security
from .pdf import create_admit_card_pdf, create_registration_pdf
from .models import StreEmailLog, StreExam, StreNotice, StreRegistration, StreSubject, StreSupportTicket, class_level_label
from .serializers import (
    INTEREST_OPTIONS,
    StreEmailLogSerializer,
    StreNoticeSerializer,
    StreSupportCreateSerializer,
    StreSupportTicketSerializer,
    StreAdminRegistrationSerializer,
    StreAdminRegistrationUpdateSerializer,
    StreExamSerializer,
    StrePublicRegistrationSerializer,
    StreRegistrationCreateSerializer,
    StreSubjectSerializer,
)

CONTENT_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}

log = logging.getLogger(__name__)


class IsStreAdmin(BasePermission):
    """Sirf STRE portal admin (aur platform Super Admin). School ke admin/teacher ko access nahi."""

    message = "Only the exam portal administrator can do this."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in (Role.STRE_ADMIN, Role.SUPER_ADMIN))


class StreThrottle(AtomicScopedRateThrottle):
    scope = "stre"


class CashfreeWebhookThrottle(AtomicScopedRateThrottle):
    """Trusted server-to-server callback from Cashfree, not public traffic — its own
    generous budget so a flood of garbage requests can't also eat into candidate-facing limits."""
    scope = "stre_webhook"


class StreOtpSendThrottle(AtomicScopedRateThrottle):
    """Own (tight) budget, separate from the general `stre` scope — an OTP-send endpoint
    is a classic email-bombing target and must not share headroom with ordinary browsing."""
    scope = "stre_otp_send"


class StreOtpVerifyThrottle(AtomicScopedRateThrottle):
    """Own (tight) budget — guards against brute-forcing the 6-digit OTP code by request
    volume, on top of security.verify_otp()'s own per-code OTP_MAX_ATTEMPTS limit."""
    scope = "stre_otp_verify"


def _safe_form_url():
    """Sirf HTTPS payment link (jaise payments.cashfree.com) public ko bhejo."""
    url = (getattr(settings, "STRE_PAYMENT_FORM_URL", "") or "").strip()
    return url if url.startswith("https://") else ""


def current_exam():
    """Abhi registration le raha exam (sabse paas wala)."""
    today = timezone.localdate()
    return (
        StreExam.objects.filter(registration_open=True, last_date__gte=today).order_by("exam_date").first()
    )


def _by_token(token):
    return get_object_or_404(StreRegistration.objects.select_related("exam"), access_token=str(token))


def _file_response(field):
    ext = field.name.rsplit(".", 1)[-1].lower()
    return FileResponse(field.open("rb"), content_type=CONTENT_TYPES.get(ext, "application/octet-stream"))


# ---------------------------------------------------------------- public (candidate) endpoints


def payment_mode():
    """Effective mode: online (sirf site checkout, sab automatic) / link / both."""
    mode = getattr(settings, "STRE_PAYMENT_MODE", "")
    if mode not in ("online", "link", "both"):
        mode = "link" if _safe_form_url() else "online"
    if payments.provider() is None:
        return "link"  # gateway keys nahi to sirf link / UPI
    if mode in ("link", "both") and not _safe_form_url() and not getattr(settings, "STRE_UPI_ID", ""):
        return "online"
    return mode


def online_checkout_enabled():
    """Site par 'Pay online' (Cashfree checkout) dikhana hai ya nahi."""
    return payments.provider() is not None and payment_mode() in ("online", "both")


def manual_payment_enabled():
    """Payment link / UPI + Payment ID (admin verify) wala raasta."""
    return payment_mode() in ("link", "both")


def _auto_sync_worker(background=False):
    """background=True sirf alag thread me: tab hi DB connection band karo (request/test ka connection nahi)."""
    from django.db import close_old_connections
    try:
        since = timezone.now() - datetime.timedelta(days=7)
        pending = StreRegistration.objects.select_related("exam").filter(
            status=StreRegistration.Status.PAYMENT_PENDING, payment_method="cashfree", created_at__gte=since,
        ).exclude(gateway_order_id="").order_by("-updated_at")[:50]
        for reg in pending:
            try_auto_confirm(reg)
        # Closed/stuck registrations ko admit-card nahi auto issue kiya jayega.
        for reg in StreRegistration.objects.select_related("exam").filter(status=StreRegistration.Status.PAID)[:50]:
            try:
                after_payment(reg, send_receipt=False)
            except Exception:  # noqa: BLE001
                log.exception("Admit card for %s could not be issued", reg.registration_no)
        cache.set("stre-auto-sync-last", timezone.now().isoformat(), 86400)
    except Exception:  # noqa: BLE001 — background check kabhi request na tode
        log.exception("STRE auto payment sync failed")
    finally:
        if background:
            close_old_connections()


def auto_sync_payments():
    """Queue a guarded Cashfree sync; Celery Beat also runs it every two minutes."""
    if not payments.cashfree_enabled() or not cache.add("stre-auto-sync-enqueue", 1, 120):
        return
    if getattr(settings, "STRE_EMAIL_SYNC", False):
        _auto_sync_worker()
    else:
        try:
            from .tasks import sync_stre_payments

            sync_stre_payments.delay()
        except Exception:  # noqa: BLE001 — don't break a public request; surface dispatch failure in logs
            cache.delete("stre-auto-sync-enqueue")
            log.exception("Could not queue STRE payment sync")


class PublicInfoView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AtomicAnonRateThrottle]

    def get(self, request):
        auto_sync_payments()
        data = cache.get_or_set("stre-public-info", self._cached_payload, timeout=30)
        return Response({
            **data,
            "results_published": StreExam.objects.filter(results_published=True).exists(),
            "payment": self._payment_data(),
        })

    @staticmethod
    def _cached_payload():
        exam = current_exam()
        return {
            "exam": None if exam is None else {
                "title": exam.title, "code": exam.code, "exam_date": exam.exam_date, "exam_time": exam.exam_time,
                "last_date": exam.last_date, "fee": exam.fee, "venue": exam.venue, "instructions": exam.instructions,
            },
            "subjects": list(StreSubject.objects.filter(is_active=True).values_list("name", flat=True)),
            "interest_options": INTEREST_OPTIONS,
        }

    @staticmethod
    def _payment_data():
        return {
            "online": online_checkout_enabled(),
            "provider": payments.provider() if online_checkout_enabled() else None,
            "cashfree_mode": payments.cashfree_mode() if payments.cashfree_enabled() else None,
            "upi_id": getattr(settings, "STRE_UPI_ID", "") if manual_payment_enabled() else "",
            "form_url": _safe_form_url() if manual_payment_enabled() else "",
            "payee_name": getattr(settings, "STRE_PAYEE_NAME", ""),
        }


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreThrottle]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def post(self, request):
        exam = current_exam()
        if exam is None:
            raise ValidationError({"detail": "Registration is closed right now. Please check back later."})
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        # FormData me interests "interests" (multiple) ya "interests[0]" ke roop me aa sakte hain
        if hasattr(request.data, "getlist"):
            items = request.data.getlist("interests") or [v for k, v in request.data.items() if re.fullmatch(r"interests\[\d+\]", k)]
            data.setlist("interests", items) if hasattr(data, "setlist") else data.__setitem__("interests", items)
        serializer = StreRegistrationCreateSerializer(data=data, context={"exam": exam})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            reg = serializer.save()
        emails.send_registration_received(reg)
        if reg.is_paid:  # free exam: paid status aur roll number only
            after_payment(reg, send_receipt=False)
            reg.refresh_from_db()
        return Response(StrePublicRegistrationSerializer(reg).data, status=201)


class StatusView(APIView):
    """Registration number + mobile se ya token se status dekho."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreThrottle]

    @staticmethod
    def _status_data(reg):
        return {
            "status": reg.status,
            "status_label": reg.get_status_display(),
            "access_token": reg.access_token,
            "registration_no": reg.registration_no,
            "amount": reg.amount,
            "payment_reference": reg.payment_reference,
            "payment_attempts": reg.payment_attempts,
            "last_payment_status": reg.last_payment_status,
            "last_payment_error": reg.last_payment_error,
            "results_published": reg.exam.results_published,
        }

    def get(self, request):
        reg, _ = try_auto_confirm(_by_token(request.query_params.get("token", "")))
        return Response(self._status_data(reg))

    def post(self, request):
        security.check_captcha(request.data.get("captcha_id"), request.data.get("captcha"))
        reg_no = str(request.data.get("registration_no", "")).strip().upper()
        mobile = re.sub(r"\D", "", str(request.data.get("mobile", "")))[-10:]
        reg = StreRegistration.objects.select_related("exam").filter(registration_no=reg_no, mobile=mobile).first()
        if reg is None:
            raise ValidationError({"detail": "No registration found with this registration number and mobile number."})
        reg, _ = try_auto_confirm(reg)
        return Response(self._status_data(reg))


class PayOrderView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreThrottle]

    def post(self, request):
        reg = _by_token(request.data.get("token", ""))
        if not online_checkout_enabled():
            raise ValidationError({"detail": "Online checkout is turned off. Please pay using the payment link shown on this page."})
        if reg.is_paid or reg.status == StreRegistration.Status.CANCELLED:
            raise ValidationError({"detail": "No payment is due for this registration."})
        if payments.cashfree_enabled():
            return_url = f"{getattr(settings, 'SITE_URL', '').rstrip('/')}/stre/status?token={reg.access_token}&cf_order={{order_id}}"
            try:
                order_id, session_id = payments.create_cashfree_order(reg, return_url=return_url)
            except payments.PaymentError as exc:
                _record_payment_issue(reg, "failed", f"Could not start: {exc}")
                raise ValidationError({"detail": f"Could not start the payment: {exc}"}) from exc
            reg.gateway_order_id = order_id
            reg.payment_method = "cashfree"
            reg.payment_attempts += 1
            reg.last_payment_status = "started"
            reg.last_payment_error = ""
            # Pehle haath se diya Payment ID (verify nahi hua) -> ab asli online payment se confirm hoga
            reg.status = StreRegistration.Status.PAYMENT_PENDING
            reg.save(update_fields=["gateway_order_id", "payment_method", "payment_attempts", "last_payment_status", "last_payment_error", "status", "updated_at"])
            return Response({"provider": "cashfree", "mode": payments.cashfree_mode(), "order_id": order_id, "payment_session_id": session_id})
        if not payments.razorpay_enabled():
            raise ValidationError({"detail": "Online payment is not available. Pay by UPI and submit the transaction ID."})
        try:
            reg.razorpay_order_id = payments.create_order(reg)
        except payments.PaymentError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        reg.save(update_fields=["razorpay_order_id", "updated_at"])
        return Response({
            "key_id": settings.RAZORPAY_KEY_ID, "order_id": reg.razorpay_order_id, "amount": int(reg.amount * 100),
            "currency": "INR", "name": reg.full_name, "email": reg.email, "mobile": reg.mobile,
            "description": f"{reg.exam.title} — {reg.registration_no}",
        })


class PayVerifyView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreThrottle]

    def post(self, request):
        reg = _by_token(request.data.get("token", ""))
        cf_order = str(request.data.get("cf_order_id", "") or "")
        if cf_order or (payments.cashfree_enabled() and not request.data.get("razorpay_order_id")):
            return Response(StrePublicRegistrationSerializer(confirm_cashfree(reg, cf_order or reg.gateway_order_id)).data)
        order_id = str(request.data.get("razorpay_order_id", ""))
        payment_id = str(request.data.get("razorpay_payment_id", ""))
        if not reg.razorpay_order_id or order_id != reg.razorpay_order_id or not payments.razorpay_enabled():
            raise ValidationError({"detail": "Payment could not be verified. If money was deducted, contact the exam cell with your registration number."})
        if not payments.verify_signature(order_id, payment_id, request.data.get("razorpay_signature", "")):
            raise ValidationError({"detail": "Payment signature is invalid. If money was deducted, contact the exam cell."})
        paid_now = False
        with transaction.atomic():
            reg = StreRegistration.objects.select_for_update().select_related("exam").get(pk=reg.pk)
            if not reg.is_paid:
                reg.razorpay_payment_id = payment_id
                reg.mark_paid("razorpay", payment_id)
                paid_now = True
        if paid_now:
            after_payment(reg)
            reg.refresh_from_db()
        return Response(StrePublicRegistrationSerializer(reg).data)


def _record_payment_issue(reg, status, error=""):
    StreRegistration.objects.filter(pk=reg.pk).update(last_payment_status=status, last_payment_error=str(error)[:300], updated_at=timezone.now())


class PayFailedView(APIView):
    """Browser me payment window band / fail hui: record rakho (admin 'Payment failed' me dekhe)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreThrottle]

    def post(self, request):
        reg = _by_token(request.data.get("token", ""))
        if not reg.is_paid:
            reason = str(request.data.get("reason", "") or "Payment not completed")[:300]
            _record_payment_issue(reg, "cancelled" if "close" in reason.lower() or "cancel" in reason.lower() else "failed", reason)
            reg.refresh_from_db()
        return Response(StrePublicRegistrationSerializer(reg).data)


def confirm_cashfree(reg, order_id):
    """Cashfree se order ka asli haal poochho (browser par bharosa nahi) aur PAID ho to seat confirm."""
    if reg.is_paid:
        return reg
    if not order_id or order_id != reg.gateway_order_id:
        raise ValidationError({"detail": "Payment could not be verified for this registration. If money was deducted, contact the exam cell with your registration number."})
    try:
        status, payment_id, amount = payments.fetch_cashfree_payment(order_id)
    except payments.PaymentError as exc:
        raise ValidationError({"detail": f"Could not check the payment: {exc}"}) from exc
    if status != "PAID":
        _record_payment_issue(reg, "pending" if status == "ACTIVE" else "failed", f"Gateway status: {status or 'unknown'}")
        raise ValidationError({"detail": "Payment is not completed yet. If money was deducted, it will be confirmed automatically in a few minutes." if status == "ACTIVE" else f"Payment {status.lower() or 'failed'}. Please try again."})
    if round(amount, 2) < round(float(reg.amount), 2):
        raise ValidationError({"detail": "Paid amount does not match the fee. Contact the exam cell."})
    with transaction.atomic():
        reg = StreRegistration.objects.select_for_update().select_related("exam").get(pk=reg.pk)
        if reg.is_paid:
            return reg
        reg.gateway_payment_id = payment_id
        reg.last_payment_status = "success"
        reg.last_payment_error = ""
        reg.mark_paid("cashfree", payment_id or order_id)
    after_payment(reg)
    reg.refresh_from_db()
    return reg


def try_auto_confirm(reg, force=False):
    """Cashfree order bana tha par confirm nahi hua (UPI app / browser band / webhook nahi): gateway se poochh ke confirm karo.
    Errors chupchaap ignore; har registration ko 30 sec me ek hi baar check (force ho to hamesha)."""
    if reg.is_paid or reg.payment_method != "cashfree" or not reg.gateway_order_id or not payments.cashfree_enabled():
        return reg, None
    key = f"stre-cf-check:{reg.pk}"
    if not force and cache.get(key):
        return reg, None
    cache.set(key, 1, 30)
    try:
        return confirm_cashfree(reg, reg.gateway_order_id), "PAID"
    except ValidationError as exc:
        detail = exc.detail.get("detail") if isinstance(exc.detail, dict) else exc.detail
        reg.refresh_from_db()
        return reg, str(detail[0] if isinstance(detail, list) else detail)


class CashfreeWebhookView(APIView):
    """Cashfree server-to-server khabar: browser band ho jaye tab bhi payment confirm ho."""

    permission_classes = [AllowAny]
    authentication_classes = []
    parser_classes = [parsers.JSONParser]
    throttle_classes = [CashfreeWebhookThrottle]

    def post(self, request):
        raw = request.body
        if not payments.cashfree_enabled() or not payments.verify_cashfree_webhook(
            raw, request.headers.get("x-webhook-timestamp", ""), request.headers.get("x-webhook-signature", "")
        ):
            return Response({"detail": "Invalid signature."}, status=400)
        order_id = str(((request.data.get("data") or {}).get("order") or {}).get("order_id", ""))
        reg = StreRegistration.objects.select_related("exam").filter(gateway_order_id=order_id).first() if order_id else None
        if reg and not reg.is_paid:
            try:
                confirm_cashfree(reg, order_id)
            except ValidationError:
                pass  # abhi PAID nahi; agla webhook / candidate verify karega
        return Response({"ok": True})


class PayManualView(APIView):
    """UPI se pay karke UTR / transaction ID submit karo; admin verify karega."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreThrottle]

    def post(self, request):
        reg = _by_token(request.data.get("token", ""))
        if not manual_payment_enabled():
            raise ValidationError({"detail": "Please pay online on this page. Online payments are confirmed automatically."})
        if reg.is_paid or reg.status == StreRegistration.Status.CANCELLED:
            raise ValidationError({"detail": "No payment is due for this registration."})
        reference = re.sub(r"\s", "", str(request.data.get("reference", ""))).upper()
        if not re.fullmatch(r"[A-Z0-9]{6,30}", reference):
            raise ValidationError({"reference": "Enter the UPI transaction ID / UTR (6–30 letters or numbers)."})
        if StreRegistration.objects.filter(payment_reference=reference).exclude(pk=reg.pk).exists():
            raise ValidationError({"reference": "This transaction ID has already been used for another registration."})
        reg.payment_reference = reference
        reg.payment_method = "manual"  # UPI ya Cashfree payment link; admin verify karega
        reg.status = StreRegistration.Status.PAYMENT_SUBMITTED
        reg.save(update_fields=["payment_reference", "payment_method", "status", "updated_at"])
        return Response(StrePublicRegistrationSerializer(reg).data)


class AdmitCardView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreThrottle]

    def get(self, request, token):
        reg = _by_token(token)
        if not reg.roll_no or reg.status != StreRegistration.Status.ADMIT_CARD_ISSUED:
            raise ValidationError({"detail": "The admit card has not been issued yet."})
        security.check_captcha(request.query_params.get("captcha_id"), request.query_params.get("captcha"))
        if not reg.roll_no or reg.status != StreRegistration.Status.ADMIT_CARD_ISSUED:
            raise ValidationError({"detail": "The admit card has not been issued yet."})
        exam = reg.exam
        return Response({
            "registration_no": reg.registration_no, "roll_no": reg.roll_no, "full_name": reg.full_name,
            "father_name": reg.father_name, "email": reg.email, "mobile": reg.mobile, "subject": reg.subject,
            "school_name": reg.school_name, "address": reg.address, "class_level": reg.class_level,
            "aadhaar_last4": reg.aadhaar_last4, "issued_at": reg.admit_card_issued_at,
            "photo_url": f"/api/v1/stre/files/{reg.access_token}/photo/",
            "signature_url": f"/api/v1/stre/files/{reg.access_token}/signature/",
            "exam": {
                "title": exam.title, "code": exam.code, "exam_date": exam.exam_date, "exam_time": exam.exam_time,
                "reporting_time": exam.reporting_time, "venue": exam.venue, "instructions": exam.instructions,
            },
        })


class AdmitCardDownloadView(APIView):
    """Direct PDF download for candidates with an issued-card access token."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreThrottle]

    def get(self, request, token):
        reg = _by_token(token)
        if not reg.roll_no or reg.status != StreRegistration.Status.ADMIT_CARD_ISSUED:
            raise ValidationError({"detail": "The admit card has not been issued yet."})
        response = HttpResponse(create_admit_card_pdf(reg, getattr(settings, "SITE_URL", "")), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="STRE-Admit-Card-{reg.roll_no}.pdf"'
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class RegistrationDownloadView(APIView):
    """Registration confirmation PDF — available as soon as payment succeeds, from the
    status-check page. Independent of the admit card (issued later, separately)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreThrottle]

    PAID_STATUSES = (StreRegistration.Status.PAID, StreRegistration.Status.ADMIT_CARD_ISSUED)

    def get(self, request, token):
        reg = _by_token(token)
        if reg.status not in self.PAID_STATUSES:
            raise ValidationError({"detail": "Your payment has not been confirmed yet. Please complete payment first."})
        response = HttpResponse(create_registration_pdf(reg, getattr(settings, "SITE_URL", "")), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="STRE-Registration-{reg.registration_no}.pdf"'
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class CandidateFileView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreThrottle]

    def get(self, request, token, kind):
        reg = _by_token(token)
        field = reg.photo if kind == "photo" else reg.signature if kind == "signature" else None
        if not field:
            return Response(status=404)
        return _file_response(field)


class VerifyRollView(APIView):
    """Admit card QR verify: sirf naam aur exam."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreThrottle]

    def get(self, request, roll_no):
        reg = StreRegistration.objects.select_related("exam").filter(roll_no=str(roll_no).upper(), status=StreRegistration.Status.ADMIT_CARD_ISSUED).first()
        if reg is None:
            return Response({"valid": False}, status=404)
        return Response({"valid": True, "full_name": reg.full_name, "roll_no": reg.roll_no, "exam": reg.exam.title, "exam_date": reg.exam.exam_date})


# ---------------------------------------------------------------- STRE admin portal


class StrePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200


class StreExamViewSet(viewsets.ModelViewSet):
    queryset = StreExam.objects.all()
    serializer_class = StreExamSerializer
    permission_classes = [IsAuthenticated, IsStreAdmin]
    pagination_class = StrePagination

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError as exc:
            raise ValidationError({"detail": "This exam has registrations and cannot be deleted. Close registration instead."}) from exc


class StreSubjectViewSet(viewsets.ModelViewSet):
    queryset = StreSubject.objects.all()
    serializer_class = StreSubjectSerializer
    permission_classes = [IsAuthenticated, IsStreAdmin]
    pagination_class = StrePagination
    search_fields = ["name"]


def assign_roll_no(reg):
    """Fee paid hote hi roll number (exam saal + 6 digit, jaise 26000007). Ek baar bana to kabhi nahi badalta."""
    if reg.roll_no or not reg.is_paid:
        return reg
    with transaction.atomic():
        StreExam.objects.select_for_update().filter(pk=reg.exam_id).first()  # ek exam me ek waqt ek hi number bane
        fresh = StreRegistration.objects.select_for_update().get(pk=reg.pk)
        if not fresh.roll_no:
            prefix = f"{fresh.exam.exam_date:%y}"
            seq = StreRegistration.objects.filter(exam=fresh.exam).exclude(roll_no="").count() + 1
            while StreRegistration.objects.filter(roll_no=f"{prefix}{seq:06d}").exists():
                seq += 1
            fresh.roll_no = f"{prefix}{seq:06d}"
            fresh.save(update_fields=["roll_no", "updated_at"])
    reg.roll_no = fresh.roll_no
    return reg


def _issue_admit_card(reg):
    if not reg.is_paid:
        raise ValidationError({"detail": f"{reg.registration_no}: fee is not paid yet."})
    assign_roll_no(reg)
    reg.status = StreRegistration.Status.ADMIT_CARD_ISSUED
    reg.admit_card_issued_at = reg.admit_card_issued_at or timezone.now()
    reg.save(update_fields=["roll_no", "status", "admit_card_issued_at", "updated_at"])


def _send_admit(reg, connection=None, log_entry=None, batch=None):
    if emails.send_admit_card(reg, connection=connection, log_entry=log_entry, batch=batch):
        reg.admit_card_sent_at = timezone.now()
        reg.save(update_fields=["admit_card_sent_at", "updated_at"])
        return True
    return False


def after_payment(reg, send_receipt=True):
    """Fee milte hi roll number aur payment receipt bhejo. Admit card admin se manually issue/send hoga."""
    assign_roll_no(reg)
    if send_receipt and reg.amount > 0:
        emails.send_payment_confirmed(reg)


class StreRegistrationAdminViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StreRegistration.objects.select_related("exam")
    serializer_class = StreAdminRegistrationSerializer
    permission_classes = [IsAuthenticated, IsStreAdmin]
    parser_classes = [parsers.JSONParser, parsers.MultiPartParser, parsers.FormParser]

    def partial_update(self, request, pk=None):
        """Admin candidate ki details theek kare (galti sudhaar)."""
        reg = self.get_object()
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        if hasattr(request.data, "getlist") and (request.data.getlist("interests") or any(k.startswith("interests[") for k in request.data)):
            items = request.data.getlist("interests") or [v for k, v in request.data.items() if k.startswith("interests[")]
            data.setlist("interests", items)
        serializer = StreAdminRegistrationUpdateSerializer(reg, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        reg = serializer.save()
        changed = getattr(serializer, "changed_fields", [])
        log_action(request, "stre_registration_edited", reg, {"fields": changed})
        resent = False
        if changed and str(request.data.get("resend_admit_card", "")).lower() in ("1", "true", "yes") and reg.status == StreRegistration.Status.ADMIT_CARD_ISSUED:
            resent = _send_admit(reg)
        out = self.get_serializer(reg).data
        out["changed_fields"] = changed
        out["admit_card_resent"] = resent
        return Response(out)

    def update(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    def destroy(self, request, pk=None):
        """Galat / duplicate registration hatao (audit log me record)."""
        reg = self.get_object()
        info = {"registration_no": reg.registration_no, "email": reg.email, "status": reg.status, "roll_no": reg.roll_no}
        log_action(request, "stre_registration_deleted", reg, info)
        files = [f for f in (reg.photo, reg.signature) if f]
        reg.delete()
        for f in files:
            try:
                f.delete(save=False)
            except Exception:  # noqa: BLE001
                pass
        return Response(status=204)
    pagination_class = StrePagination
    filterset_fields = ["exam", "status", "subject"]
    search_fields = ["registration_no", "roll_no", "first_name", "last_name", "email", "mobile", "father_name", "payment_reference"]

    def list(self, request, *args, **kwargs):
        auto_sync_payments()
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get("payment_issue") == "failed":
            return qs.filter(status=StreRegistration.Status.PAYMENT_PENDING, last_payment_status__in=["failed", "cancelled"])
        # Bina payment wala registration confirm nahi: admin list me tabhi dikhe jab "Unpaid" filter chuna ho
        if self.action in ("list", "stats", "export") and params.get("status") != StreRegistration.Status.PAYMENT_PENDING:
            qs = qs.exclude(status=StreRegistration.Status.PAYMENT_PENDING)
        return qs

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        reg = self.get_object()
        if reg.is_paid:
            raise ValidationError({"detail": "Already marked as paid."})
        reg.mark_paid(reg.payment_method or "offline", str(request.data.get("reference", "")).strip()[:100])
        log_action(request, "stre_payment_verified", reg)
        after_payment(reg)
        reg.refresh_from_db()
        return Response(self.get_serializer(reg).data)

    @action(detail=True, methods=["post"], url_path="check-payment")
    def check_payment(self, request, pk=None):
        """Cashfree se is registration ka payment abhi check karo."""
        reg = self.get_object()
        if reg.is_paid:
            return Response({**self.get_serializer(reg).data, "message": "Payment is already confirmed."})
        if reg.payment_method != "cashfree" or not reg.gateway_order_id:
            raise ValidationError({"detail": "This candidate has not started an online (Cashfree) payment yet."})
        reg, note = try_auto_confirm(reg, force=True)
        if reg.is_paid:
            log_action(request, "stre_payment_synced", reg, {"order": reg.gateway_order_id})
            return Response({**self.get_serializer(reg).data, "message": "Payment found on Cashfree and confirmed. Confirmation email sent."})
        raise ValidationError({"detail": note or "Payment is not completed on Cashfree yet."})

    @action(detail=False, methods=["post"], url_path="sync-payments")
    def sync_payments(self, request):
        """Saare pending Cashfree orders ek saath check karo."""
        if not payments.cashfree_enabled():
            raise ValidationError({"detail": "Cashfree is not configured."})
        pending = StreRegistration.objects.select_related("exam").filter(
            status=StreRegistration.Status.PAYMENT_PENDING, payment_method="cashfree"
        ).exclude(gateway_order_id="").order_by("-updated_at")[:100]
        confirmed = []
        for reg in pending:
            reg, _ = try_auto_confirm(reg, force=True)
            if reg.is_paid:
                confirmed.append(reg.registration_no)
        if confirmed:
            log_action(request, "stre_payments_synced", request.user, {"confirmed": confirmed})
        n = len(confirmed)
        return Response({"checked": len(pending), "confirmed": confirmed, "detail": f"Checked {len(pending)} pending online payment(s). {n} confirmed{': ' + ', '.join(confirmed) if n else ''}."})

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        reg = self.get_object()
        reg.status = StreRegistration.Status.CANCELLED
        reg.admin_note = str(request.data.get("note", ""))[:300]
        reg.save(update_fields=["status", "admin_note", "updated_at"])
        log_action(request, "stre_registration_cancelled", reg)
        return Response(self.get_serializer(reg).data)

    @action(detail=True, methods=["post"], url_path="issue-admit-card")
    def issue_admit_card(self, request, pk=None):
        reg = self.get_object()
        _issue_admit_card(reg)
        sent = _send_admit(reg) if str(request.data.get("send", "true")).lower() in ("1", "true", "yes") else False
        log_action(request, "stre_admit_card_issued", reg)
        data = self.get_serializer(reg).data
        data["email_sent"] = sent
        return Response(data)

    @action(detail=True, methods=["post"], url_path="send-admit-card")
    def send_admit_card(self, request, pk=None):
        reg = self.get_object()
        if reg.status != StreRegistration.Status.ADMIT_CARD_ISSUED:
            raise ValidationError({"detail": "Issue the admit card first."})
        if not _send_admit(reg):
            raise ValidationError({"detail": "The email could not be sent. Check the email settings and try again."})
        return Response({"detail": f"Admit card emailed to {reg.email}."})

    @action(detail=False, methods=["post"], url_path="generate-admit-cards")
    def generate_admit_cards(self, request):
        exam = get_object_or_404(StreExam, pk=request.data.get("exam"))
        send = str(request.data.get("send", "true")).lower() in ("1", "true", "yes")
        pending = StreRegistration.objects.filter(exam=exam, status=StreRegistration.Status.PAID).order_by("created_at")
        issued = sent = 0
        for reg in pending:
            with transaction.atomic():
                _issue_admit_card(reg)
            issued += 1
            if send and _send_admit(reg):
                sent += 1
        log_action(request, "stre_admit_cards_generated", exam, {"created": issued})
        return Response({"issued": issued, "emailed": sent, "detail": f"{issued} admit cards generated, {sent} emailed."})

    @action(detail=False, methods=["post"], url_path="send-pending-admit-cards")
    def send_pending_admit_cards(self, request):
        exam = get_object_or_404(StreExam, pk=request.data.get("exam"))
        regs = StreRegistration.objects.filter(exam=exam, status=StreRegistration.Status.ADMIT_CARD_ISSUED, admit_card_sent_at__isnull=True)
        sent = sum(1 for reg in regs if _send_admit(reg))
        return Response({"emailed": sent, "detail": f"{sent} admit cards emailed."})

    @action(detail=True, methods=["get"], url_path=r"file/(?P<kind>photo|signature)")
    def file(self, request, pk=None, kind=None):
        reg = self.get_object()
        field = reg.photo if kind == "photo" else reg.signature
        if not field:
            return Response(status=404)
        return _file_response(field)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = self.filter_queryset(self.get_queryset())
        by_status = dict(qs.values_list("status").annotate(n=Count("id")).values_list("status", "n"))
        collected = qs.filter(status__in=[StreRegistration.Status.PAID, StreRegistration.Status.ADMIT_CARD_ISSUED]).aggregate(t=Sum("amount"))["t"] or 0
        unpaid_qs = StreRegistration.objects.filter(status=StreRegistration.Status.PAYMENT_PENDING)
        if self.request.query_params.get("exam"):
            unpaid_qs = unpaid_qs.filter(exam_id=self.request.query_params["exam"])
        failed = unpaid_qs.filter(last_payment_status__in=["failed", "cancelled"]).count()
        by_status["payment_pending"] = unpaid_qs.count()
        email_failed = StreEmailLog.objects.filter(registration__in=qs, status=StreEmailLog.Status.FAILED).count()
        total = qs.exclude(status=StreRegistration.Status.PAYMENT_PENDING).count()
        return Response({"total": total, "by_status": by_status, "collected": collected, "payment_failed": failed, "email_failed": email_failed,
                         "auto_sync": payments.cashfree_enabled(), "last_payment_check": cache.get("stre-auto-sync-last")})

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="stre-registrations.csv"'
        response.write("﻿")  # Excel ke liye UTF-8 BOM
        writer = csv.writer(response)
        writer.writerow(["Registration no", "Roll no", "First name", "Last name", "Father's name", "Class / Qualification", "School / College", "Address", "Email", "Mobile", "Subject", "Interests", "Aim of life", "Status", "Amount", "Payment ref", "Registered on"])
        for r in qs:
            writer.writerow([r.registration_no, r.roll_no, r.first_name, r.last_name, r.father_name, class_level_label(r.class_level), r.school_name, r.address, r.email, r.mobile, r.subject, ", ".join(r.interests), r.aim_of_life, r.get_status_display(), r.amount, r.payment_reference or r.razorpay_payment_id, r.created_at.strftime("%d-%m-%Y %H:%M")])
        return response


class StreDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsStreAdmin]

    def get(self, request):
        auto_sync_payments()
        today = timezone.localdate()
        regs = StreRegistration.objects.exclude(status=StreRegistration.Status.PAYMENT_PENDING)  # sirf confirmed (paid)
        unpaid = StreRegistration.objects.filter(status=StreRegistration.Status.PAYMENT_PENDING)
        return Response({
            "exams": StreExam.objects.count(),
            "open_exam": StreExamSerializer(current_exam()).data if current_exam() else None,
            "closed_exams": [
                {
                    "id": str(e.pk), "title": e.title, "code": e.code, "last_date": e.last_date,
                    "reason": "Registration is switched off" if not e.registration_open else f"Last date ({e.last_date:%d %b %Y}) has passed",
                }
                for e in StreExam.objects.filter(exam_date__gte=today - datetime.timedelta(days=30)).order_by("-exam_date")[:5]
                if not e.is_accepting
            ],
            "registrations": regs.count(),
            "support_open": StreSupportTicket.objects.exclude(status=StreSupportTicket.Status.RESOLVED).count(),
            "today": regs.filter(created_at__date=today).count(),
            "payment_pending": unpaid.count(),
            "to_verify": regs.filter(status=StreRegistration.Status.PAYMENT_SUBMITTED).count(),
            "paid": regs.filter(status=StreRegistration.Status.PAID).count(),
            "admit_cards": regs.filter(status=StreRegistration.Status.ADMIT_CARD_ISSUED).count(),
            "collected": regs.filter(Q(status=StreRegistration.Status.PAID) | Q(status=StreRegistration.Status.ADMIT_CARD_ISSUED)).aggregate(t=Sum("amount"))["t"] or 0,
        })


class StreEmailStatusView(APIView):
    """Email setting ka haal + test email (STRE admin ke liye)."""

    permission_classes = [IsAuthenticated, IsStreAdmin]

    def _status(self):
        backend = settings.EMAIL_BACKEND.rsplit(".", 1)[-1].replace("EmailBackend", "").lower() or "smtp"
        real = backend == "smtp"
        return {
            "mode": "smtp" if real else backend,
            "sends_real_email": real and bool(settings.EMAIL_HOST_USER and settings.EMAIL_HOST_PASSWORD),
            "host": settings.EMAIL_HOST if real else "",
            "user": settings.EMAIL_HOST_USER if real else "",
            "from_email": settings.DEFAULT_FROM_EMAIL,
            "site_url": getattr(settings, "SITE_URL", ""),
        }

    def get(self, request):
        return Response(self._status())

    def post(self, request):
        to = str(request.data.get("to") or request.user.email).strip()
        from django.core.validators import validate_email
        from django.core.exceptions import ValidationError as DjangoValidationError

        try:
            validate_email(to)
        except DjangoValidationError as exc:
            raise ValidationError({"to": "Enter a valid email address."}) from exc
        try:
            emails.send_test_email(to)
        except Exception as exc:  # noqa: BLE001 — SMTP ki asli wajah admin ko dikhao
            raise ValidationError({"detail": f"Email could not be sent: {exc}"}) from exc
        status = self._status()
        note = "" if status["sends_real_email"] else " (development mode: printed in the backend terminal, not delivered)"
        return Response({"detail": f"Test email sent to {to}{note}.", **status})



# ---------------------------------------------------------------- bulk email (background)


def _process_email_logs(log_ids, background=False):
    """Ek SMTP connection se queue ki saari mails bhejo; har mail ka status log me."""
    from django.core.mail import get_connection
    from django.db import close_old_connections

    if background:
        close_old_connections()
    connection = None
    try:
        connection = get_connection(fail_silently=False)
        try:
            connection.open()
        except Exception:  # noqa: BLE001 — connection na khule to har mail khud koshish karegi
            connection = None
        for log_entry in StreEmailLog.objects.select_related("registration__exam").filter(
            pk__in=log_ids, status=StreEmailLog.Status.QUEUED,
        ):
            reg = log_entry.registration
            if log_entry.kind == StreEmailLog.Kind.ADMIT_CARD:
                if reg.status != StreRegistration.Status.ADMIT_CARD_ISSUED:
                    log_entry.status = StreEmailLog.Status.FAILED
                    log_entry.error = "Admit card is not issued for this candidate."
                    log_entry.save(update_fields=["status", "error"])
                    continue
                _send_admit(reg, connection=connection, log_entry=log_entry)
            else:
                emails.deliver(reg, log_entry.kind, subject=log_entry.subject, message=log_entry.message, connection=connection, log_entry=log_entry)
    finally:
        if connection is not None:
            try:
                connection.close()
            except Exception:  # noqa: BLE001
                pass
        if background:
            close_old_connections()


def run_email_job(log_ids):
    """Send synchronously in tests; queue bulk email delivery in production."""
    if not log_ids:
        return
    if getattr(settings, "STRE_EMAIL_SYNC", False):
        _process_email_logs(log_ids)
        return
    try:
        from .tasks import process_stre_email_logs

        process_stre_email_logs.delay([str(log_id) for log_id in log_ids])
    except Exception as exc:  # noqa: BLE001 — mark logs failed and report queue failures to the admin
        StreEmailLog.objects.filter(pk__in=log_ids, status=StreEmailLog.Status.QUEUED).update(
            status=StreEmailLog.Status.FAILED,
            error=f"Celery queue error: {exc}"[:500],
        )
        log.exception("Could not queue STRE email delivery")
        raise ValidationError({"detail": "Emails could not be queued. Check the Celery/Redis service and retry."}) from exc


class StreBulkEmailView(APIView):
    """Ek click: sabko admit card / announcement mail. Fail wale 'Failed' section me."""

    permission_classes = [IsAuthenticated, IsStreAdmin]

    def post(self, request):
        import uuid as _uuid

        exam = get_object_or_404(StreExam, pk=request.data.get("exam"))
        kind = str(request.data.get("kind", ""))
        batch = _uuid.uuid4()
        regs = StreRegistration.objects.filter(exam=exam).exclude(status=StreRegistration.Status.CANCELLED)
        issued = 0
        subject = message = ""
        if kind == "admit_card":
            # Paid candidates ka admit card issue karo (admin ke kehne par), phir sabko mail
            if str(request.data.get("issue", "true")).lower() in ("1", "true", "yes"):
                for reg in regs.filter(status=StreRegistration.Status.PAID).order_by("created_at"):
                    with transaction.atomic():
                        _issue_admit_card(reg)
                    issued += 1
            targets = regs.filter(status=StreRegistration.Status.ADMIT_CARD_ISSUED)
            if str(request.data.get("only_unsent", "false")).lower() in ("1", "true", "yes"):
                targets = targets.filter(admit_card_sent_at__isnull=True)
        elif kind == "announcement":
            subject = str(request.data.get("subject", "")).strip()[:200]
            message = str(request.data.get("message", "")).strip()[:5000]
            if len(subject) < 3 or len(message) < 5:
                raise ValidationError({"subject": "Enter a subject and a message."} if len(subject) < 3 else {"message": "Write the message to send."})
            audience = str(request.data.get("audience", "all"))
            targets = regs.exclude(status=StreRegistration.Status.PAYMENT_PENDING)  # "all" = confirmed candidates
            if audience in {c for c, _ in StreRegistration.Status.choices}:
                targets = regs.filter(status=audience)
        else:
            raise ValidationError({"kind": "Choose admit_card or announcement."})
        logs = StreEmailLog.objects.bulk_create([
            StreEmailLog(registration=r, kind=kind, subject=subject, message=message, to_email=r.email, batch=batch)
            for r in targets
        ])
        log_action(request, "stre_bulk_email", exam, {"count": len(logs), "kind": kind})
        run_email_job([entry.pk for entry in logs])
        return Response({
            "batch": str(batch), "queued": len(logs), "issued": issued,
            "detail": f"{len(logs)} emails are being sent" + (f" ({issued} new admit cards issued)" if issued else "") + ".",
        })


class StreEmailLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StreEmailLog.objects.select_related("registration")
    serializer_class = StreEmailLogSerializer
    permission_classes = [IsAuthenticated, IsStreAdmin]
    pagination_class = StrePagination
    filterset_fields = ["status", "kind", "batch", "registration__exam"]
    search_fields = ["to_email", "registration__registration_no", "registration__first_name", "registration__last_name"]

    @action(detail=False, methods=["get"])
    def summary(self, request):
        qs = self.filter_queryset(self.get_queryset())
        counts = dict(qs.values_list("status").annotate(n=Count("id")).values_list("status", "n"))
        return Response({"queued": counts.get("queued", 0), "sent": counts.get("sent", 0), "failed": counts.get("failed", 0), "total": qs.count()})

    @action(detail=True, methods=["post"])
    def resend(self, request, pk=None):
        entry = self.get_object()
        entry.status = StreEmailLog.Status.QUEUED
        entry.save(update_fields=["status"])
        _process_email_logs([entry.pk])
        entry.refresh_from_db()
        if entry.status != StreEmailLog.Status.SENT:
            raise ValidationError({"detail": f"Could not send to {entry.to_email}: {entry.error or 'unknown error'}"})
        return Response({"detail": f"Email sent to {entry.to_email}.", **self.get_serializer(entry).data})

    @action(detail=False, methods=["post"], url_path="resend-failed")
    def resend_failed(self, request):
        qs = StreEmailLog.objects.filter(status=StreEmailLog.Status.FAILED)
        if request.data.get("exam"):
            qs = qs.filter(registration__exam_id=request.data.get("exam"))
        ids = list(qs.values_list("pk", flat=True))
        StreEmailLog.objects.filter(pk__in=ids).update(status=StreEmailLog.Status.QUEUED)
        run_email_job(ids)
        return Response({"queued": len(ids), "detail": f"Resending {len(ids)} failed emails."})



# ---------------------------------------------------------------- support + notices


class StreSupportCreateView(APIView):
    """Candidate apni samasya bheje (bina login)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreThrottle]

    def post(self, request):
        serializer = StreSupportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = serializer.save()
        emails.send_support_ack(ticket)
        return Response({"ticket_no": ticket.ticket_no, "detail": f"Request {ticket.ticket_no} received. We will reply on {ticket.email}."}, status=201)


class StreSupportAdminViewSet(viewsets.ModelViewSet):
    queryset = StreSupportTicket.objects.select_related("registration")
    serializer_class = StreSupportTicketSerializer
    permission_classes = [IsAuthenticated, IsStreAdmin]
    pagination_class = StrePagination
    http_method_names = ["get", "patch", "delete", "head", "options"]
    filterset_fields = ["status", "category"]
    search_fields = ["ticket_no", "name", "email", "mobile", "registration_no", "subject"]

    def perform_update(self, serializer):
        before = serializer.instance.admin_reply
        ticket = serializer.save()
        if ticket.admin_reply and ticket.admin_reply != before:
            ticket.replied_at = timezone.now()
            ticket.save(update_fields=["replied_at", "updated_at"])
            emails.send_support_reply(ticket)
        log_action(self.request, "stre_support_updated", ticket, {"status": ticket.status})

    @action(detail=False, methods=["get"])
    def counts(self, request):
        data = dict(StreSupportTicket.objects.values_list("status").annotate(n=Count("id")).values_list("status", "n"))
        return Response({"open": data.get("open", 0), "in_progress": data.get("in_progress", 0), "resolved": data.get("resolved", 0)})


class StreNoticeAdminViewSet(viewsets.ModelViewSet):
    queryset = StreNotice.objects.all()
    serializer_class = StreNoticeSerializer
    permission_classes = [IsAuthenticated, IsStreAdmin]
    pagination_class = StrePagination
    search_fields = ["title", "body"]


def active_stre_notices():
    today = timezone.localdate()
    return StreNotice.objects.filter(is_active=True, publish_on__lte=today).filter(Q(expires_on__isnull=True) | Q(expires_on__gte=today))


class StrePublicNoticesView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AtomicAnonRateThrottle]

    def get(self, request):
        return Response(StreNoticeSerializer(active_stre_notices()[:20], many=True).data)


class StreNoticeFileView(APIView):
    """STRE notice ki PDF: active notice ho to koi bhi dekhe; STRE admin hamesha."""

    authentication_classes = [OptionalCookieJWTAuthentication]
    permission_classes = [AllowAny]
    throttle_classes = [AtomicAnonRateThrottle]

    def get(self, request, notice_id):
        notice = StreNotice.objects.filter(pk=notice_id).first()
        if notice is None or not notice.attachment:
            raise Http404
        is_admin = request.user.is_authenticated and request.user.role in ("stre_admin", "super_admin")
        if not is_admin and not active_stre_notices().filter(pk=notice.pk).exists():
            raise Http404
        try:
            handle = notice.attachment.open("rb")
        except FileNotFoundError as exc:
            raise Http404 from exc
        name = notice.attachment.name.rsplit("/", 1)[-1]
        response = FileResponse(handle, content_type="application/pdf", as_attachment=request.query_params.get("download") == "1", filename=name)
        response["Cache-Control"] = "private, max-age=300"
        return response



# ---------------------------------------------------------------- email OTP + captcha


class StreOtpSendView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreOtpSendThrottle]

    def post(self, request):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from django.core.validators import validate_email

        email = str(request.data.get("email", "")).strip().lower()
        try:
            validate_email(email)
        except DjangoValidationError as exc:
            raise ValidationError({"email": "Enter a valid email address, e.g. name@example.com."}) from exc
        exam = current_exam()
        if exam and StreRegistration.objects.filter(exam=exam, email=email).exists():
            raise ValidationError({"email": "This email is already registered for this exam. Use 'Check status' to see your registration."})
        code = security.create_otp(email)
        if not emails.send_otp(email, code):
            raise ValidationError({"email": "Could not send the OTP email. Please check the address and try again."})
        return Response({"detail": f"OTP sent to {email}. It is valid for {security.OTP_VALID_MINUTES} minutes.", "resend_after": security.OTP_RESEND_SECONDS})


class StreOtpVerifyView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreOtpVerifyThrottle]

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        code = "".join(ch for ch in str(request.data.get("code", "")) if ch.isdigit())
        if len(code) != 6:
            raise ValidationError({"code": "Enter the 6-digit OTP from your email."})
        token = security.verify_otp(email, code)
        return Response({"email_token": token, "detail": "Email verified."})


class StreCaptchaView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [StreThrottle]

    def get(self, request):
        captcha, svg = security.new_captcha()
        return Response({"id": str(captcha.pk), "svg": svg})
