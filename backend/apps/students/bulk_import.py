"""Students ka bulk admission: Excel (.xlsx) / CSV file -> check (dry run) -> background me accounts banana."""
import csv
import io
import re
import secrets
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.db import close_old_connections, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.academics.models import ClassRoom

from .models import Student, StudentImportJob

User = get_user_model()

MAX_ROWS = 2000
MAX_MB = 5
CREDENTIAL_HOURS = 24

# (field, header in template, required, example 1, example 2, help)
COLUMNS = [
    ("first_name", "First name", True, "Aarav", "Diya", "Student's first name"),
    ("last_name", "Last name", False, "Sharma", "Verma", ""),
    ("admission_no", "Admission no", True, "2026001", "2026002", "Unique in your school"),
    ("class_level", "Class", True, "5", "10", "1 to 12 (also: Class 5, V)"),
    ("section", "Section", False, "A", "", "Must exist as a classroom in the current session (optional)"),
    ("roll_no", "Roll no", False, "1", "", ""),
    ("date_of_birth", "Date of birth", False, "15-08-2015", "02-01-2010", "DD-MM-YYYY"),
    ("gender", "Gender", False, "M", "F", "M / F / O (or Male / Female / Other)"),
    ("father_name", "Father name", True, "Rakesh Sharma", "Anil Verma", ""),
    ("mother_name", "Mother name", True, "Sunita Sharma", "Pooja Verma", ""),
    ("guardian_phone", "Parent phone", False, "9876543210", "9123456780", "10-digit mobile"),
    ("email", "Email", False, "aarav.sharma@example.com", "", "Login email. Leave empty to auto-create a login ID"),
    ("password", "Password", False, "", "", "Leave empty to auto-generate (you get a download)"),
    ("blood_group", "Blood group", False, "B+", "", "A+ A- B+ B- AB+ AB- O+ O-"),
    ("address", "Address", False, "12 MG Road, Varanasi", "", ""),
]
FIELDS = [c[0] for c in COLUMNS]
ALIASES = {
    "firstname": "first_name", "name": "first_name", "student_name": "first_name", "lastname": "last_name", "surname": "last_name",
    "admission_number": "admission_no", "admission": "admission_no", "adm_no": "admission_no", "admno": "admission_no", "sr_no": "admission_no",
    "class": "class_level", "std": "class_level", "standard": "class_level", "grade": "class_level",
    "sec": "section", "roll": "roll_no", "roll_number": "roll_no",
    "dob": "date_of_birth", "birth_date": "date_of_birth", "father": "father_name", "fathers_name": "father_name", "father_s_name": "father_name",
    "mother": "mother_name", "mothers_name": "mother_name", "mother_s_name": "mother_name",
    "phone": "guardian_phone", "parent_phone": "guardian_phone", "guardian_phone_no": "guardian_phone", "mobile": "guardian_phone", "parent_mobile": "guardian_phone", "guardian_mobile": "guardian_phone", "contact": "guardian_phone",
    "email_id": "email", "e_mail": "email", "blood": "blood_group",
}
ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8, "ix": 9, "x": 10, "xi": 11, "xii": 12}
GENDERS = {"m": "M", "male": "M", "boy": "M", "f": "F", "female": "F", "girl": "F", "o": "O", "other": "O"}


def _key(header):
    k = re.sub(r"[^a-z0-9]+", "_", str(header or "").strip().lower().replace("*", "")).strip("_")
    return k if k in FIELDS else ALIASES.get(k, ALIASES.get(k.replace("_", ""), k))


def _text(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)  # Excel: 2026001.0 -> 2026001
    return " ".join(str(value).split())


def read_rows(upload):
    """File -> list of dicts (row number ke saath). .xlsx aur .csv dono."""
    name = (getattr(upload, "name", "") or "").lower()
    if upload.size > MAX_MB * 1024 * 1024:
        raise ValidationError({"file": f"File is too large. Keep it under {MAX_MB} MB (about {MAX_ROWS} students)."})
    raw = upload.read()
    if name.endswith((".xlsx", ".xlsm")):
        try:
            from openpyxl import load_workbook
            sheet = load_workbook(io.BytesIO(raw), read_only=True, data_only=True).worksheets[0]
            table = [list(r) for r in sheet.iter_rows(values_only=True)]
        except Exception as exc:  # noqa: BLE001 — kharab file
            raise ValidationError({"file": "This Excel file could not be read. Save it as .xlsx and try again."}) from exc
    elif name.endswith(".csv"):
        for enc in ("utf-8-sig", "cp1252"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        table = list(csv.reader(io.StringIO(text)))
    elif name.endswith(".xls"):
        raise ValidationError({"file": "Old .xls files are not supported. In Excel use File → Save As → Excel Workbook (.xlsx)."})
    else:
        raise ValidationError({"file": "Upload an Excel (.xlsx) or CSV file."})

    # Header row: pehli row jisme "admission" / "first name" jaisa kuch ho
    header_idx = next((i for i, r in enumerate(table[:10]) if {"first_name", "admission_no"} <= {_key(c) for c in r}), None)
    if header_idx is None:
        raise ValidationError({"file": "Header row not found. Use the template — it needs at least “First name” and “Admission no” columns."})
    keys = [_key(c) for c in table[header_idx]]
    rows = []
    for offset, r in enumerate(table[header_idx + 1:], start=header_idx + 2):
        values = {k: r[i] for i, k in enumerate(keys) if k in FIELDS and i < len(r)}
        if not any(_text(v) for v in values.values()):
            continue  # khali row
        rows.append((offset, values))
    if not rows:
        raise ValidationError({"file": "No student rows found below the header."})
    if len(rows) > MAX_ROWS:
        raise ValidationError({"file": f"{len(rows)} rows found. Upload at most {MAX_ROWS} students per file."})
    return rows


def _date(value):
    if value in (None, ""):
        return None, None
    if isinstance(value, datetime):
        return value.date().isoformat(), None
    if isinstance(value, date):
        return value.isoformat(), None
    if isinstance(value, (int, float)) and 1000 < value < 80000:  # Excel serial date
        return (date(1899, 12, 30) + timedelta(days=int(value))).isoformat(), None
    text = _text(value)
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%Y-%m-%d", "%d-%m-%y", "%d/%m/%y", "%d %b %Y", "%d %B %Y", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).date().isoformat(), None
        except ValueError:
            continue
    return None, "Use DD-MM-YYYY, e.g. 15-08-2015."


def _class(value):
    text = _text(value).lower().replace("class", "").replace("std", "").strip(" .-")
    if text.isdigit() and 1 <= int(text) <= 12:
        return str(int(text))
    if text in ROMAN:
        return str(ROMAN[text])
    return None


def _password():
    words = ["Lotus", "Tiger", "River", "Mango", "Cloud", "Star", "Peacock", "Neem", "Ganga", "Kite"]
    return f"{secrets.choice(words)}@{secrets.randbelow(900000) + 100000}"


def _login_id(admission_no, school):
    slug = re.sub(r"[^a-z0-9]+", "", admission_no.lower()) or secrets.token_hex(3)
    return f"{slug}.{re.sub(r'[^a-z0-9]+', '', school.code.lower())}@student.local"


def validate_rows(request, school, rows):
    """Har row check: return (valid list, errors list). Database me kuch nahi likhta."""
    from .serializers import StudentSerializer

    rooms = {}
    for room in ClassRoom.objects.filter(school=school, academic_year__is_current=True).select_related("course"):
        level = room.course.name.lower().replace("class", "").strip()
        rooms[(level, room.section.strip().lower())] = room
    seats = {}
    existing_adm = set(Student.objects.filter(school=school).values_list("admission_no", flat=True))
    adm_count = Counter(_text(v.get("admission_no")) for _, v in rows)
    email_count = Counter(_text(v.get("email")).lower() for _, v in rows if _text(v.get("email")))

    valid, errors = [], []
    for line, values in rows:
        problems = {}
        data = {f: _text(values.get(f)) for f in FIELDS if f not in ("date_of_birth", "class_level", "gender", "section")}
        adm = data["admission_no"]
        level = _class(values.get("class_level"))
        if not level:
            problems["class_level"] = "Class must be 1 to 12."
        else:
            data["class_level"] = level
        dob, dob_err = _date(values.get("date_of_birth"))
        if dob_err:
            problems["date_of_birth"] = dob_err
        elif dob:
            data["date_of_birth"] = dob
        g = _text(values.get("gender")).lower()
        if g:
            if g not in GENDERS:
                problems["gender"] = "Use M, F or O."
            else:
                data["gender"] = GENDERS[g]
        data["blood_group"] = data["blood_group"].upper().replace(" ", "").replace("VE", "")
        if adm and adm in existing_adm:
            problems["admission_no"] = "This admission number already exists in your school."
        elif adm and adm_count[adm] > 1:
            problems["admission_no"] = "Repeated in this file."
        if data["email"] and email_count[data["email"].lower()] > 1:
            problems["email"] = "Repeated in this file."
        if not data["email"] and adm:
            data["email"] = _login_id(adm, school)
        generated = not data["password"]
        if generated:
            data["password"] = _password()
        section = _text(values.get("section")).lower()
        room = None
        if section and level:
            room = rooms.get((level, section))
            if room is None:
                problems["section"] = f"No Class {level} - {section.upper()} classroom in the current session."
            else:
                seats[room.pk] = seats.get(room.pk, room.students.count()) + 1
                if room.capacity and seats[room.pk] > room.capacity:
                    problems["section"] = f"Class {level} - {section.upper()} is full ({room.capacity} seats)."
                data["classroom"] = str(room.pk)
        data = {k: v for k, v in data.items() if v != ""}
        ser = StudentSerializer(data=data, context={"request": request})
        if not ser.is_valid():
            for field, msgs in ser.errors.items():
                msg = msgs[0] if isinstance(msgs, list) else msgs
                problems.setdefault(field if field in FIELDS or field == "classroom" else "row", str(msg.get(next(iter(msg))) if isinstance(msg, dict) else msg))
        if problems:
            errors.append({"row": line, "admission_no": adm, "name": f"{data.get('first_name', '')} {data.get('last_name', '')}".strip(), "errors": problems})
        else:
            valid.append({"row": line, "data": ser.validated_data, "password": data["password"], "generated": generated, "room": room})
    return valid, errors


def preview(valid, errors, total):
    sample = [
        {"row": v["row"], "admission_no": v["data"]["admission_no"], "name": f"{v['data'].get('first_name', '')} {v['data'].get('last_name', '')}".strip(),
         "class_level": v["data"].get("class_level", ""), "section": v["room"].section if v["room"] else "", "email": v["data"].get("email", "")}
        for v in valid[:15]
    ]
    return {"total": total, "valid": len(valid), "invalid": len(errors), "errors": errors[:300], "preview": sample}


def _create_all(job_id, school_id, valid, background=False):
    """Background: pehle passwords hash (slow, parallel), phir ek transaction me sab accounts."""
    if background:
        close_old_connections()
    job = StudentImportJob.objects.get(pk=job_id)
    try:
        hashes = [None] * len(valid)
        with ThreadPoolExecutor(max_workers=4) as pool:
            for i, h in enumerate(pool.map(lambda v: make_password(v["password"]), valid)):
                hashes[i] = h
                if i % 10 == 9 or i == len(valid) - 1:
                    StudentImportJob.objects.filter(pk=job_id).update(done=i + 1)
        credentials = []
        with transaction.atomic():
            for v, pw_hash in zip(valid, hashes):
                d = dict(v["data"])
                for k in ("password", "profile_photo"):
                    d.pop(k, None)
                user = User(
                    email=d.pop("email").lower(), first_name=d.pop("first_name"), last_name=d.pop("last_name", "") or "",
                    role="student", school_id=school_id,
                )
                user.password = pw_hash
                user.save()
                student = Student.objects.create(school_id=school_id, user=user, **d)
                credentials.append({
                    "admission_no": student.admission_no, "name": user.get_full_name(), "class_level": student.class_level,
                    "section": v["room"].section if v["room"] else "", "email": user.email,
                    "password": v["password"] if v["generated"] else "(as given in file)",
                })
        job.credentials = credentials
        job.status = StudentImportJob.Status.DONE
        job.done = len(valid)
        job.save(update_fields=["credentials", "status", "done", "updated_at"])
    except Exception as exc:  # noqa: BLE001 — job fail dikhana hai, server crash nahi
        job.status = StudentImportJob.Status.FAILED
        job.error = "Import failed and nothing was saved. " + (str(exc)[:300] or exc.__class__.__name__)
        job.save(update_fields=["status", "error", "updated_at"])
    finally:
        if background:
            close_old_connections()


def start_import(request, school, valid, file_name):
    job = StudentImportJob.objects.create(school=school, file_name=file_name[:200], total=len(valid), created_by=request.user)
    if getattr(settings, "STUDENT_IMPORT_SYNC", False):
        _create_all(job.pk, school.pk, valid)
        job.refresh_from_db()
    else:
        transaction.on_commit(lambda: threading.Thread(target=_create_all, args=(job.pk, school.pk, valid), kwargs={"background": True}, daemon=True).start())
    return job


def job_payload(job):
    expired = job.created_at < timezone.now() - timedelta(hours=CREDENTIAL_HOURS)
    if expired and job.credentials:
        job.credentials = []
        job.save(update_fields=["credentials"])
    return {
        "id": str(job.pk), "status": job.status, "total": job.total, "done": job.done, "error": job.error,
        "file_name": job.file_name, "created_at": job.created_at, "credentials_available": bool(job.credentials),
        "created": len(job.credentials) if job.status == StudentImportJob.Status.DONE else 0,
    }


def credentials_csv(job):
    out = io.StringIO()
    out.write("﻿")  # Excel me Hindi/₹ sahi dikhe
    w = csv.writer(out)
    w.writerow(["Admission no", "Name", "Class", "Section", "Login email", "Temporary password"])
    for c in job.credentials:
        w.writerow([c["admission_no"], c["name"], c["class_level"], c["section"], c["email"], c["password"]])
    return out.getvalue()


def template_file(kind):
    headers = [f"{c[1]}{' *' if c[2] else ''}" for c in COLUMNS]
    ex1, ex2 = [c[3] for c in COLUMNS], [c[4] for c in COLUMNS]
    if kind == "csv":
        out = io.StringIO()
        out.write("﻿")
        w = csv.writer(out)
        w.writerows([headers, ex1, ex2])
        return out.getvalue().encode("utf-8"), "text/csv", "students-import-template.csv"
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    wb = Workbook()
    ws = wb.active
    ws.title = "Students"
    ws.append(headers)
    ws.append(ex1)
    ws.append(ex2)
    for i, col in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=i)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="4F46E5" if col[2] else "64748B")
        ws.column_dimensions[cell.column_letter].width = max(14, len(col[1]) + 6)
        for r in range(2, 2002):
            ws.cell(row=r, column=i).number_format = "@"  # sab text: 0 / date auto-badalna band
    ws.freeze_panes = "A2"
    info = wb.create_sheet("How to fill")
    info.append(["Column", "Required", "How to fill"])
    for c in COLUMNS:
        info.append([c[1], "Yes" if c[2] else "No", c[5]])
    info.append([])
    info.append(["Tips", "", "Delete the 2 example rows before uploading. Up to 2000 students per file. Blue columns are required."])
    for cell in info[1]:
        cell.font = Font(bold=True)
    info.column_dimensions["A"].width = 18
    info.column_dimensions["C"].width = 80
    for row in info.iter_rows(min_row=2):
        row[2].alignment = Alignment(wrap_text=True)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "students-import-template.xlsx"
