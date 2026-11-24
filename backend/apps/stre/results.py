"""STRE result: marks entry (table / Excel), rank, publish, result email, merit certificate + QR verify."""
import csv
import io
import re
import uuid
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.audit import log_action
from apps.core.throttles import AtomicAnonRateThrottle

from . import security
from .models import StreEmailLog, StreExam, StreRegistration, StreResult, class_level_label
from .views import IsStreAdmin

ABSENT_WORDS = {"ab", "absent", "a", "abs"}


def candidates(exam):
    """Jinke admit card issue hue — wahi exam me baithe."""
    return StreRegistration.objects.filter(exam=exam, status=StreRegistration.Status.ADMIT_CARD_ISSUED).exclude(roll_no="").order_by("roll_no")


def recompute_ranks(exam):
    """Competition ranking: 95, 90, 90, 85 -> 1, 2, 2, 4. Absent / bina marks = rank nahi."""
    results = list(StreResult.objects.filter(exam=exam))
    scored = sorted((r for r in results if not r.is_absent and r.marks is not None), key=lambda r: r.marks, reverse=True)
    ranks = {}
    prev, rank = None, 0
    for position, r in enumerate(scored, start=1):
        if r.marks != prev:
            rank, prev = position, r.marks
        ranks[r.pk] = rank
    changed = []
    for r in results:
        new = ranks.get(r.pk)
        if r.rank != new:
            r.rank = new
            changed.append(r)
    StreResult.objects.bulk_update(changed, ["rank"])


def _parse_marks(raw, total):
    """'78' / '78.5' / 'AB' -> (marks, absent, error)."""
    text = str(raw if raw is not None else "").strip()
    if text == "":
        return None, False, None
    if text.lower() in ABSENT_WORDS:
        return None, True, None
    try:
        value = Decimal(text)
    except InvalidOperation:
        return None, False, "Marks must be a number, or AB for absent."
    if value < 0 or value > total:
        return None, False, f"Marks must be between 0 and {total}."
    return value.quantize(Decimal("0.01")), False, None


def apply_rows(exam, rows):
    """rows: [{roll_no, marks, absent}] -> (saved_count, errors). Sab sahi ho tabhi save."""
    by_roll = {r.roll_no.upper(): r for r in candidates(exam)}
    errors, clean, seen = [], [], set()
    for i, row in enumerate(rows, start=1):
        line = row.get("line", i)
        roll = str(row.get("roll_no", "")).strip().upper()
        if roll.endswith(".0"):
            roll = roll[:-2]
        reg = by_roll.get(roll)
        if not roll:
            continue
        if reg is None:
            errors.append({"line": line, "roll_no": roll, "error": "Roll number not found among candidates with an admit card."})
            continue
        if roll in seen:
            errors.append({"line": line, "roll_no": roll, "error": "Repeated roll number."})
            continue
        seen.add(roll)
        marks, absent, err = _parse_marks(row.get("marks"), exam.total_marks)
        if str(row.get("absent", "")).strip().lower() in ("1", "true", "yes", "y", "ab", "absent"):
            marks, absent, err = None, True, None
        if err:
            errors.append({"line": line, "roll_no": roll, "error": err})
            continue
        clean.append((reg, marks, absent))
    if errors:
        return 0, errors
    with transaction.atomic():
        for reg, marks, absent in clean:
            StreResult.objects.update_or_create(registration=reg, defaults={"exam": exam, "marks": marks, "is_absent": absent})
        recompute_ranks(exam)
    return len(clean), []


def result_payload(res, full=True):
    reg, exam = res.registration, res.exam
    data = {
        "roll_no": reg.roll_no, "registration_no": reg.registration_no, "full_name": reg.full_name,
        "exam_title": exam.title, "exam_date": exam.exam_date, "total_marks": exam.total_marks,
        "marks": None if res.marks is None else float(res.marks), "is_absent": res.is_absent,
        "rank": res.rank, "percentage": res.percentage, "award": res.award,
        "candidates": StreResult.objects.filter(exam=exam, is_absent=False, marks__isnull=False).count(),
    }
    if full:
        data.update({
            "father_name": reg.father_name, "school_name": reg.school_name, "class_level": reg.class_level, "subject": reg.subject,
            "certificate_code": res.certificate_code if res.award else "", "access_token": reg.access_token,
            "published_at": exam.results_published_at,
        })
    return data


# ---------------------------------------------------------------- admin


class _ExamMixin:
    def exam(self, request):
        exam_id = request.query_params.get("exam") or request.data.get("exam")
        try:
            return get_object_or_404(StreExam, pk=exam_id)
        except (ValueError, Exception) as exc:  # noqa: BLE001 — galat UUID
            if hasattr(exc, "status_code"):
                raise
            raise ValidationError({"exam": "Select an exam."}) from exc


class ResultListView(_ExamMixin, APIView):
    permission_classes = [IsAuthenticated, IsStreAdmin]

    def get(self, request):
        exam = self.exam(request)
        results = {r.registration_id: r for r in StreResult.objects.filter(exam=exam)}
        rows = []
        for reg in candidates(exam):
            r = results.get(reg.pk)
            rows.append({
                "registration": str(reg.pk), "roll_no": reg.roll_no, "full_name": reg.full_name, "class_level": reg.class_level,
                "school_name": reg.school_name, "subject": reg.subject,
                "marks": None if not r or r.marks is None else float(r.marks), "is_absent": bool(r and r.is_absent),
                "rank": r.rank if r else None, "award": r.award if r else "",
            })
        entered = sum(1 for x in rows if x["marks"] is not None or x["is_absent"])
        return Response({
            "exam": {"id": str(exam.pk), "title": exam.title, "total_marks": exam.total_marks, "merit_count": exam.merit_count,
                     "results_published": exam.results_published, "results_published_at": exam.results_published_at},
            "summary": {"candidates": len(rows), "entered": entered, "pending": len(rows) - entered,
                        "absent": sum(1 for x in rows if x["is_absent"])},
            "rows": rows,
        })


class ResultSaveView(_ExamMixin, APIView):
    permission_classes = [IsAuthenticated, IsStreAdmin]

    def post(self, request):
        exam = self.exam(request)
        rows = request.data.get("rows")
        if not isinstance(rows, list):
            raise ValidationError({"rows": "Send the marks list."})
        saved, errors = apply_rows(exam, rows)
        if errors:
            return Response({"detail": f"{len(errors)} row(s) have problems. Nothing was saved.", "errors": errors}, status=400)
        log_action(request, "stre_results_saved", request.user, {"exam": exam.code, "rows": saved})
        return Response({"saved": saved, "detail": f"Marks saved for {saved} candidate(s)."})


def _read_table(upload):
    name = (upload.name or "").lower()
    raw = upload.read()
    if upload.size > 5 * 1024 * 1024:
        raise ValidationError({"file": "File is too large (max 5 MB)."})
    if name.endswith(".xlsx"):
        try:
            from openpyxl import load_workbook
            sheet = load_workbook(io.BytesIO(raw), read_only=True, data_only=True).worksheets[0]
            return [list(r) for r in sheet.iter_rows(values_only=True)]
        except Exception as exc:  # noqa: BLE001
            raise ValidationError({"file": "This Excel file could not be read. Save it as .xlsx and try again."}) from exc
    if name.endswith(".csv"):
        for enc in ("utf-8-sig", "cp1252"):
            try:
                return list(csv.reader(io.StringIO(raw.decode(enc))))
            except UnicodeDecodeError:
                continue
    raise ValidationError({"file": "Upload the Excel (.xlsx) or CSV marks file."})


class ResultUploadView(_ExamMixin, APIView):
    permission_classes = [IsAuthenticated, IsStreAdmin]

    def post(self, request):
        exam = self.exam(request)
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "Choose the marks file."})
        table = _read_table(upload)
        norm = lambda c: re.sub(r"[^a-z]", "", str(c or "").lower())  # noqa: E731
        header_idx = next((i for i, r in enumerate(table[:10]) if any(norm(c) in ("rollno", "roll", "rollnumber") for c in r)), None)
        if header_idx is None:
            raise ValidationError({"file": "Header row with “Roll no” and “Marks” columns not found. Use the template."})
        header = [norm(c) for c in table[header_idx]]
        col = lambda *names: next((i for i, h in enumerate(header) if any(h == n or h.startswith(n) for n in names)), None)  # noqa: E731
        roll_i, marks_i, absent_i = col("rollno", "roll", "rollnumber"), col("marks", "marksobtained", "score"), col("absent")
        if marks_i is None:
            raise ValidationError({"file": "“Marks” column not found."})
        rows = []
        for line, r in enumerate(table[header_idx + 1:], start=header_idx + 2):
            get = lambda i: (r[i] if i is not None and i < len(r) else "")  # noqa: E731
            if not any(str(c or "").strip() for c in r):
                continue
            value = get(roll_i)
            if isinstance(value, float) and value.is_integer():
                value = int(value)
            rows.append({"line": line, "roll_no": value, "marks": get(marks_i), "absent": get(absent_i)})
        saved, errors = apply_rows(exam, rows)
        if errors:
            return Response({"detail": f"{len(errors)} row(s) have problems. Nothing was saved.", "errors": errors[:300]}, status=400)
        log_action(request, "stre_results_uploaded", request.user, {"exam": exam.code, "rows": saved, "file": upload.name})
        return Response({"saved": saved, "detail": f"Marks uploaded for {saved} candidate(s)."})


class ResultTemplateView(_ExamMixin, APIView):
    permission_classes = [IsAuthenticated, IsStreAdmin]

    def get(self, request):
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill

        exam = self.exam(request)
        existing = {r.registration_id: r for r in StreResult.objects.filter(exam=exam)}
        wb = Workbook()
        ws = wb.active
        ws.title = "Marks"
        ws.append(["Roll no", "Name", "Class", "School", f"Marks (out of {exam.total_marks})", "Absent (write AB)"])
        for cell in ws[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="4F46E5")
        for reg in candidates(exam):
            r = existing.get(reg.pk)
            ws.append([reg.roll_no, reg.full_name, class_level_label(reg.class_level), reg.school_name,
                       None if not r or r.marks is None else float(r.marks), "AB" if r and r.is_absent else ""])
        for letter, width in zip("ABCDEF", (14, 28, 8, 32, 20, 18)):
            ws.column_dimensions[letter].width = width
        ws.freeze_panes = "A2"
        buf = io.BytesIO()
        wb.save(buf)
        response = HttpResponse(buf.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response["Content-Disposition"] = f'attachment; filename="{exam.code}-marks.xlsx"'
        return response


class ResultPublishView(_ExamMixin, APIView):
    """Publish / unpublish. Publish par rank dobara + (chaho to) sabko result email."""

    permission_classes = [IsAuthenticated, IsStreAdmin]

    def post(self, request):
        from .views import run_email_job

        exam = self.exam(request)
        publish = str(request.data.get("publish", "true")).lower() in ("1", "true", "yes")
        if publish:
            total = candidates(exam).count()
            done = StreResult.objects.filter(exam=exam).filter(is_absent=True).count() + StreResult.objects.filter(exam=exam, marks__isnull=False).count()
            if total == 0 or done == 0:
                raise ValidationError({"detail": "Enter marks before publishing the result."})
            recompute_ranks(exam)
        exam.results_published = publish
        exam.results_published_at = timezone.now() if publish else None
        exam.save(update_fields=["results_published", "results_published_at", "updated_at"])
        queued = 0
        if publish and str(request.data.get("email", "true")).lower() in ("1", "true", "yes"):
            batch = uuid.uuid4()
            regs = [r.registration for r in StreResult.objects.select_related("registration").filter(exam=exam)]
            logs = StreEmailLog.objects.bulk_create([
                StreEmailLog(registration=reg, kind=StreEmailLog.Kind.RESULT, to_email=reg.email, batch=batch) for reg in regs
            ])
            run_email_job([log.pk for log in logs])
            queued = len(logs)
        log_action(request, "stre_results_published" if publish else "stre_results_unpublished", request.user, {"exam": exam.code, "emails": queued})
        if not publish:
            return Response({"detail": "Result hidden from candidates.", "results_published": False})
        return Response({"detail": f"Result published.{f' Result email is being sent to {queued} candidate(s).' if queued else ''}", "results_published": True, "emails": queued})


class ResultExportView(_ExamMixin, APIView):
    permission_classes = [IsAuthenticated, IsStreAdmin]

    def get(self, request):
        exam = self.exam(request)
        out = io.StringIO()
        out.write("﻿")
        w = csv.writer(out)
        w.writerow(["Rank", "Roll no", "Name", "Father's name", "Class", "School", "Subject", f"Marks / {exam.total_marks}", "Percentage", "Certificate", "Mobile", "Email"])
        rows = StreResult.objects.select_related("registration", "exam").filter(exam=exam)
        for r in sorted(rows, key=lambda x: (x.rank is None, x.rank or 0, x.registration.roll_no)):
            reg = r.registration
            w.writerow([r.rank or ("AB" if r.is_absent else "—"), reg.roll_no, reg.full_name, reg.father_name, class_level_label(reg.class_level), reg.school_name, reg.subject,
                        "AB" if r.is_absent else (r.marks if r.marks is not None else ""), r.percentage or "", r.award, reg.mobile, reg.email])
        response = HttpResponse(out.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{exam.code}-merit-list.csv"'
        return response


# ---------------------------------------------------------------- public (candidate)


class ResultThrottle(AtomicAnonRateThrottle):
    scope = "stre"


def _published_result(reg):
    if not reg.exam.results_published:
        raise ValidationError({"detail": "Results have not been declared yet. You will get an email when they are out."})
    res = StreResult.objects.select_related("registration", "exam").filter(registration=reg).first()
    if res is None:
        raise ValidationError({"detail": "No result found for this roll number. Contact the exam cell if you appeared in the exam."})
    return res


class PublicResultView(APIView):
    """Roll no + mobile + captcha se, ya status page ke token se result."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ResultThrottle]

    def get(self, request):
        reg = get_object_or_404(StreRegistration.objects.select_related("exam"), access_token=str(request.query_params.get("token", "")))
        return Response(result_payload(_published_result(reg)))

    def post(self, request):
        security.check_captcha(request.data.get("captcha_id"), request.data.get("captcha"))
        roll = str(request.data.get("roll_no", "")).strip().upper()
        mobile = re.sub(r"\D", "", str(request.data.get("mobile", "")))[-10:]
        reg = StreRegistration.objects.select_related("exam").filter(roll_no=roll, mobile=mobile).first()
        if reg is None:
            raise ValidationError({"detail": "No candidate found with this roll number and mobile number."})
        return Response(result_payload(_published_result(reg)))


class CertificateVerifyView(APIView):
    """Certificate ke QR se: asli hai ya nahi (sirf naam, exam, award, rank)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ResultThrottle]

    def get(self, request, code):
        res = StreResult.objects.select_related("registration", "exam").filter(certificate_code=str(code).upper(), exam__results_published=True).first()
        if res is None or not res.award:
            return Response({"valid": False}, status=404)
        return Response({"valid": True, **result_payload(res, full=False), "award": res.award})
