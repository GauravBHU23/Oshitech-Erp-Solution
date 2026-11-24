"""Session change: students ko agli class / naye academic year me bhejna (promote, detain, pass out) + undo."""
import uuid
from collections import Counter

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Max, Q
from rest_framework.exceptions import ValidationError

from apps.academics.models import AcademicYear, ClassRoom

from .models import IDCard, Student, StudentPromotion

ACTIONS = {
    "promote": StudentPromotion.Action.PROMOTED,
    "detain": StudentPromotion.Action.DETAINED,
    "pass_out": StudentPromotion.Action.PASSED_OUT,
}
LEVELS = [str(n) for n in range(1, 13)]


def _bool(value, default):
    if value is None or value == "":
        return default
    return str(value).lower() in ("1", "true", "yes", "on")


def _get(qs, pk):
    if not pk:
        return None
    try:
        return qs.filter(pk=pk).first()
    except (ValueError, DjangoValidationError):
        return None


def _classroom(school, value, year, field):
    if not value:
        return None
    room = _get(ClassRoom.objects.select_related("course", "academic_year").filter(school=school), value)
    if room is None:
        raise ValidationError({field: "Classroom not found in this school."})
    if room.academic_year_id != year.id:
        raise ValidationError({field: f"Choose a classroom of the new session ({year.name})."})
    return room


def _free_seats(room):
    return room.capacity - room.students.filter(is_active=True).count()


def run_promotion(request, school, data):
    level = str(data.get("from_class_level", "")).strip()
    if level not in LEVELS:
        raise ValidationError({"from_class_level": "Select the current class (1–12)."})
    year = _get(AcademicYear.objects.filter(school=school), data.get("target_year"))
    if year is None:
        raise ValidationError({"target_year": "Select the new academic year (session)."})

    to_room = _classroom(school, data.get("to_classroom"), year, "to_classroom")
    detain_room = _classroom(school, data.get("detain_classroom"), year, "detain_classroom")

    decisions = data.get("decisions")
    if not isinstance(decisions, list) or not decisions:
        raise ValidationError({"decisions": "Select at least one student."})
    wanted = {}
    for item in decisions:
        if not isinstance(item, dict) or item.get("action") not in ACTIONS:
            raise ValidationError({"decisions": "Each student needs an action: promote, detain or pass out."})
        wanted[str(item.get("student"))] = item["action"]

    if level == "12" and "promote" in wanted.values():
        raise ValidationError({"decisions": "Class 12 students cannot be promoted. Mark them as passed out (or detain)."})

    try:
        students = Student.objects.filter(school=school, is_active=True, class_level=level, pk__in=list(wanted))
        if data.get("from_classroom"):
            students = students.filter(classroom_id=data.get("from_classroom"))
        students = list(students.select_related("user"))
    except (ValueError, DjangoValidationError) as exc:
        raise ValidationError({"decisions": "Invalid student list."}) from exc
    if len(students) != len(wanted):
        raise ValidationError({"decisions": "Some selected students are not active students of this class. Reload and try again."})

    already = sorted(
        StudentPromotion.objects.filter(student__in=students, academic_year=year, undone=False)
        .values_list("student__admission_no", flat=True)
    )
    if already:
        raise ValidationError({"decisions": f"{len(already)} student(s) were already moved to {year.name} (e.g. {', '.join(already[:5])}). Undo that promotion first."})

    counts = Counter(wanted.values())
    next_level = str(int(level) + 1)
    if to_room and counts["promote"]:
        room_level = to_room.course.name.lower().replace("class", "").strip()
        if room_level.isdigit() and room_level != next_level:
            raise ValidationError({"to_classroom": f"Promoted students go to Class {next_level}; this classroom is {to_room.course.name}."})
        free = _free_seats(to_room)
        if counts["promote"] > free:
            raise ValidationError({"to_classroom": f"This section has only {max(free, 0)} seats left for {counts['promote']} students. Increase capacity or choose another section."})
    if detain_room and counts["detain"]:
        free = _free_seats(detain_room)
        if counts["detain"] > free:
            raise ValidationError({"detain_classroom": f"This section has only {max(free, 0)} seats left for {counts['detain']} students."})

    reset_roll = _bool(data.get("reset_roll_no"), True)
    renew_cards = _bool(data.get("renew_id_cards"), True)
    make_current = _bool(data.get("make_year_current"), False)
    batch = uuid.uuid4()

    with transaction.atomic():
        records = []
        for st in students:
            act = wanted[str(st.pk)]
            card = IDCard.objects.filter(student=st).first()
            rec = StudentPromotion(
                school=school, batch=batch, student=st, action=ACTIONS[act], academic_year=year,
                from_class_level=st.class_level, from_classroom_id=st.classroom_id, from_roll_no=st.roll_no,
                from_valid_until=card.valid_until if card else None, performed_by=request.user,
            )
            if act == "promote":
                st.class_level = next_level
                st.classroom = to_room
            elif act == "detain":
                st.classroom = detain_room
            else:
                st.is_active = False  # pass out: record rehta hai, ID card apne aap invalid
            if reset_roll and act != "pass_out":
                st.roll_no = ""
            st.save(update_fields=["class_level", "classroom", "roll_no", "is_active", "updated_at"])
            rec.to_class_level = st.class_level
            rec.to_classroom_id = st.classroom_id
            records.append(rec)
            if card and renew_cards and act != "pass_out" and not card.is_revoked:
                card.valid_until = year.end_date
                card.save(update_fields=["valid_until", "updated_at"])
        StudentPromotion.objects.bulk_create(records)
        if make_current:
            AcademicYear.objects.filter(school=school).exclude(pk=year.pk).update(is_current=False)
            AcademicYear.objects.filter(pk=year.pk).update(is_current=True)

    parts = []
    if counts["promote"]:
        parts.append(f"{counts['promote']} promoted to Class {next_level}")
    if counts["detain"]:
        parts.append(f"{counts['detain']} detained in Class {level}")
    if counts["pass_out"]:
        parts.append(f"{counts['pass_out']} passed out")
    return {
        "batch": str(batch), "year": year.name,
        "promoted": counts["promote"], "detained": counts["detain"], "passed_out": counts["pass_out"],
        "detail": f"Session {year.name}: " + ", ".join(parts) + ".",
    }


def undo_batch(school, batch):
    try:
        batch = uuid.UUID(str(batch))
    except ValueError as exc:
        raise ValidationError({"batch": "Invalid promotion."}) from exc
    records = list(StudentPromotion.objects.select_related("student").filter(school=school, batch=batch, undone=False))
    if not records:
        raise ValidationError({"batch": "This promotion was not found or is already undone."})
    newer = StudentPromotion.objects.filter(
        student__in=[r.student_id for r in records], undone=False, created_at__gt=records[0].created_at
    ).exclude(batch=batch)
    if newer.exists():
        raise ValidationError({"batch": "Some of these students were moved again later. Undo the newer promotion first."})
    with transaction.atomic():
        for r in records:
            st = r.student
            st.class_level = r.from_class_level
            st.classroom_id = r.from_classroom_id
            st.roll_no = r.from_roll_no
            st.is_active = True
            st.save(update_fields=["class_level", "classroom", "roll_no", "is_active", "updated_at"])
            if r.from_valid_until:
                IDCard.objects.filter(student=st).update(valid_until=r.from_valid_until)
        StudentPromotion.objects.filter(pk__in=[r.pk for r in records]).update(undone=True)
    return {"restored": len(records), "detail": f"Promotion undone. {len(records)} student(s) are back in their previous class."}


def recent_batches(school_filter):
    rows = (
        StudentPromotion.objects.filter(**school_filter)
        .values("batch", "academic_year__name", "from_class_level", "undone")
        .annotate(
            total=Count("id"), at=Max("created_at"), by=Max("performed_by__email"),
            promoted=Count("id", filter=Q(action="promoted")),
            detained=Count("id", filter=Q(action="detained")),
            passed_out=Count("id", filter=Q(action="passed_out")),
        )
        .order_by("-at")[:20]
    )
    return [
        {
            "batch": str(r["batch"]), "year": r["academic_year__name"], "from_class_level": r["from_class_level"],
            "undone": r["undone"], "total": r["total"], "promoted": r["promoted"], "detained": r["detained"],
            "passed_out": r["passed_out"], "at": r["at"], "by": r["by"] or "",
        }
        for r in rows
    ]
