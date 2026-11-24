"""STRE emails — premium, responsive HTML (Gmail, Outlook, Apple Mail, phone) + plain-text version.

Dev me SMTP user/password na hon to email backend terminal me print hoti hai.
"""
import logging
from html import escape

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from .models import class_level_label

log = logging.getLogger(__name__)

BRAND = "STRE Exam Cell"
ACCENT = "#4f46e5"


def _site():
    return getattr(settings, "SITE_URL", "https://oshitech.in").rstrip("/")


def _rows_html(rows):
    out = []
    for i, (label, value) in enumerate(rows):
        border = "" if i == len(rows) - 1 else "border-bottom:1px solid #eef0f6;"
        out.append(
            f"<tr><td class='row-label' style='padding:12px 0;{border}font:500 13px/18px Segoe UI,Roboto,Arial,sans-serif;color:#64748b;width:42%;vertical-align:top'>{escape(label)}</td>"
            f"<td class='row-value' style='padding:12px 0;{border}font:600 14px/20px Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;text-align:right;vertical-align:top'>{escape(str(value))}</td></tr>"
        )
    return "".join(out)


def render(*, preheader, badge, badge_color, title, greeting, intro, highlight_label=None, highlight_value=None, rows=(), cta=None, note=None, custom_html="", show_cta_link=True):
    """Ek hi premium layout sab STRE emails ke liye."""
    highlight = ""
    if highlight_value:
        highlight = (
            "<tr><td style='padding:0 32px 8px' class='px'>"
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#f5f3ff;border:1px solid #e0e7ff;border-radius:16px'>"
            f"<tr><td align='center' style='padding:20px 16px'><div style='font:700 11px/14px Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#6d28d9'>{escape(highlight_label or '')}</div>"
            f"<div class='hl' style='margin-top:6px;font:800 30px/36px Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.04em;color:#1e1b4b'>{escape(str(highlight_value))}</div></td></tr></table></td></tr>"
        )
    details = ""
    if rows:
        details = (
            "<tr><td style='padding:16px 32px 4px' class='px'>"
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='border:1px solid #eef0f6;border-radius:14px'>"
            f"<tr><td style='padding:4px 18px'><table role='presentation' width='100%' cellpadding='0' cellspacing='0'>{_rows_html(rows)}</table></td></tr></table></td></tr>"
        )
    button = ""
    if cta:
        label, url = cta
        fallback_link = (
            f"<div style='margin-top:12px;font:400 12px/18px Segoe UI,Roboto,Arial,sans-serif;color:#94a3b8'>Button not working? Copy this link:<br><a href='{escape(url)}' style='color:{ACCENT};word-break:break-all'>{escape(url)}</a></div>"
            if show_cta_link else ""
        )
        button = (
            "<tr><td align='center' style='padding:24px 32px 8px' class='px'>"
            "<table role='presentation' cellpadding='0' cellspacing='0' class='btn-wrap'><tr>"
            f"<td align='center' bgcolor='{ACCENT}' style='border-radius:12px;background:linear-gradient(135deg,#6366f1,#4338ca)'>"
            f"<a href='{escape(url)}' class='btn' style='display:inline-block;padding:15px 34px;font:700 15px/20px Segoe UI,Roboto,Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:12px'>{escape(label)} &rarr;</a>"
            "</td></tr></table>"
            f"{fallback_link}</td></tr>"
        )
    note_html = ""
    if note:
        items = "".join(f"<li style='margin:0 0 6px'>{escape(n)}</li>" for n in note)
        note_html = (
            "<tr><td style='padding:16px 32px 0' class='px'>"
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#fffbeb;border:1px solid #fde68a;border-radius:14px'>"
            f"<tr><td style='padding:14px 18px;font:400 13px/20px Segoe UI,Roboto,Arial,sans-serif;color:#78350f'><b style='display:block;margin-bottom:6px'>Important</b><ul style='margin:0;padding-left:18px'>{items}</ul></td></tr></table></td></tr>"
        )

    return f"""<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>{escape(title)}</title>
<style>
  body{{margin:0;padding:0;background:#eef1f8}}
  a{{color:{ACCENT}}}
  @media (max-width:620px){{
    .container{{width:100%!important;border-radius:0!important}}
    .px{{padding-left:18px!important;padding-right:18px!important}}
    .title{{font-size:20px!important;line-height:26px!important}}
    .hl{{font-size:22px!important;line-height:28px!important}}
    .row-label,.row-value{{display:block!important;width:100%!important;text-align:left!important}}
    .row-label{{padding-bottom:0!important;border-bottom:0!important}}
    .btn-wrap,.btn-wrap td{{width:100%!important}} .btn{{display:block!important}}
    .stack,.stack td{{display:block!important;width:100%!important;padding-right:0!important}}
    .head-brand,.head-badge{{display:block!important;width:100%!important;text-align:left!important}}
    .head-badge{{margin-top:10px!important;text-align:left!important}}
    .ticket-photo{{margin-bottom:10px!important}}
  }}
  @media (prefers-color-scheme:dark){{
    body,.bg{{background:#0b1220!important}}
    .container,.card{{background:#111c30!important}}
    .title,.row-value,.hl{{color:#f1f5f9!important}}
    .text,.row-label{{color:#cbd5e1!important}}
  }}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#eef1f8">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">{escape(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:#eef1f8">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="container" style="width:600px;max-width:600px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,.10)">
    <tr><td bgcolor="#312e81" style="background:#312e81;background-image:linear-gradient(135deg,#3b1d6e 0%,#4f46e5 60%,#0ea5e9 130%);padding:28px 32px" class="px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td class="head-brand" style="vertical-align:middle">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td width="44" height="44" align="center" bgcolor="#ffffff" style="width:44px;height:44px;border-radius:12px;background:#ffffff;font:800 20px/44px Segoe UI,Roboto,Arial,sans-serif;color:#4338ca">S</td>
            <td style="padding-left:12px"><div style="font:700 15px/20px Segoe UI,Roboto,Arial,sans-serif;color:#ffffff">STRE</div><div style="font:500 11px/16px Segoe UI,Roboto,Arial,sans-serif;color:#c7d2fe;letter-spacing:.06em">Student Talent Recognition Exam</div></td>
          </tr></table>
        </td>
        <td class="head-badge" align="right" style="vertical-align:middle"><span style="display:inline-block;padding:6px 12px;border-radius:999px;background:{badge_color};font:700 11px/14px Segoe UI,Roboto,Arial,sans-serif;color:#ffffff;letter-spacing:.04em">{escape(badge)}</span></td>
      </tr></table>
    </td></tr>
    <tr><td class="card px" style="padding:30px 32px 10px">
      <h1 class="title" style="margin:0;font:700 26px/32px Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">{escape(title)}</h1>
      <p class="text" style="margin:14px 0 0;font:400 15px/24px Segoe UI,Roboto,Arial,sans-serif;color:#334155">{escape(greeting)}</p>
      <p class="text" style="margin:8px 0 18px;font:400 15px/24px Segoe UI,Roboto,Arial,sans-serif;color:#334155">{escape(intro)}</p>
    </td></tr>
    {highlight}{custom_html}{details}{button}{note_html}
    <tr><td class="px" style="padding:28px 32px 30px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eef0f6"><tr><td style="padding-top:18px;font:400 12px/19px Segoe UI,Roboto,Arial,sans-serif;color:#94a3b8">
        Regards,<br><b style="color:#475569">{BRAND}</b><br>
        You received this email because you registered for STRE. Please do not share your registration links with anyone.
      </td></tr></table>
    </td></tr>
  </table>
  <div style="padding:16px 8px 0;font:400 11px/16px Segoe UI,Roboto,Arial,sans-serif;color:#94a3b8">&copy; {BRAND} · Powered by Oshitech Education ERP</div>
</td></tr>
</table>
</body>
</html>"""


def _send(to, subject, text_lines, html, connection=None, inline_images=None):
    """Email bhejo. Returns (ok, error_message). inline_images: [(cid, bytes, subtype)]"""
    from email.mime.image import MIMEImage

    email_subject = subject.strip()
    if not email_subject.casefold().startswith("oshitech"):
        email_subject = f"Oshitech STRE | {email_subject}"
    text = "\n\n".join([f"Purpose: {email_subject}", f"STRE account: {to}", *text_lines, f"— {BRAND}"])
    message = EmailMultiAlternatives(email_subject, text, getattr(settings, "DEFAULT_FROM_EMAIL", None), [to], connection=connection)
    message.attach_alternative(html, "text/html")
    if inline_images:
        message.mixed_subtype = "related"
        for cid, data, subtype in inline_images:
            image = MIMEImage(data, _subtype=subtype)
            image.add_header("Content-ID", f"<{cid}>")
            image.add_header("Content-Disposition", "inline", filename=f"{cid}.{subtype}")
            message.attach(image)
    try:
        message.send(fail_silently=False)
        return True, ""
    except Exception as exc:  # noqa: BLE001 — email band ho to registration fail nahi honi chahiye
        log.exception("STRE email delivery failed")
        return False, str(exc)[:500] or exc.__class__.__name__


def status_link(reg):
    return f"{_site()}/stre/status?token={reg.access_token}"


def _rupees(value):
    return f"₹{value:,.0f}" if float(value) == int(value) else f"₹{value:,.2f}"


def build_registration(reg, **_):
    exam = reg.exam
    paid = reg.is_paid
    rows = [
        ("Candidate", reg.full_name),
        ("Exam", exam.title),
        ("Exam date", f"{exam.exam_date:%d %b %Y}"),
        ("Subject", reg.subject),
        ("Fee", "Free" if reg.amount <= 0 else _rupees(reg.amount)),
        ("Status", reg.get_status_display()),
    ]
    intro = (
        "Your registration is confirmed."
        if paid else
        f"Your registration is NOT confirmed yet. Pay the registration fee of {_rupees(reg.amount)} to confirm it."
    )
    html = render(
        preheader=f"Registration {reg.registration_no} received" + ("" if paid else " — pay the fee to confirm"),
        badge="Registration received" if paid else "Payment pending", badge_color="#7c3aed" if paid else "#d97706",
        title="You're registered for STRE!" if paid else "One step left — pay the fee to confirm", greeting=f"Dear {reg.full_name},", intro=intro,
        highlight_label="Registration number", highlight_value=reg.registration_no,
        rows=rows, cta=("Check registration status" if paid else "Pay fee now", status_link(reg)),
        note=["Your admit card is not ready yet. The exam cell will issue it and email it to you separately before the exam."] if paid else ["Keep your registration number safe.", "Use your registration number and mobile number to check status anytime."],
    )
    text = [f"Dear {reg.full_name},", intro, f"Registration number: {reg.registration_no}", f"Check status / pay fee: {status_link(reg)}"]
    return (f"STRE registration confirmed — {reg.registration_no}" if paid else f"Complete your payment — STRE registration {reg.registration_no} is not confirmed yet"), text, html


def build_payment(reg, **_):
    reference = reg.payment_reference or reg.gateway_payment_id or reg.razorpay_payment_id or "—"
    rows = [
        ("Registration no.", reg.registration_no),
        *([("Roll no.", reg.roll_no)] if reg.roll_no else []),
        ("Candidate", reg.full_name),
        ("Payment reference", reference),
        ("Paid on", f"{reg.paid_at:%d %b %Y, %I:%M %p}" if reg.paid_at else "—"),
        ("Method", (reg.payment_method or "—").upper()),
    ]
    html = render(
        preheader=f"Payment of {_rupees(reg.amount)} received for {reg.registration_no}",
        badge="Payment confirmed", badge_color="#059669",
        title="Payment received — seat confirmed", greeting=f"Dear {reg.full_name},",
        intro="Thank you! We have received your registration fee and your registration is confirmed.",
        highlight_label="Amount paid", highlight_value=_rupees(reg.amount), rows=rows, cta=("Check registration status", status_link(reg)),
        note=["Your admit card is not ready yet. The exam cell will issue it and email it to you separately before the exam."],
    )
    text = [f"Dear {reg.full_name},", f"We received your payment of {_rupees(reg.amount)} for {reg.registration_no}.", *([f"Your roll number: {reg.roll_no}"] if reg.roll_no else []), f"Reference: {reference}", f"Status: {status_link(reg)}"]
    return f"STRE payment confirmed — {reg.registration_no}" + (f" · Roll no. {reg.roll_no}" if reg.roll_no else ""), text, html


def _photo_bytes(reg):
    """Candidate photo (email ke andar dikhane ke liye). 1.5 MB se badi ho to skip."""
    try:
        if not reg.photo or reg.photo.size > 1_500_000:
            return None
        ext = reg.photo.name.rsplit(".", 1)[-1].lower()
        subtype = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "webp": "webp", "gif": "gif"}.get(ext)
        if not subtype:
            return None
        with reg.photo.open("rb") as fh:
            return fh.read(), subtype
    except Exception:  # noqa: BLE001
        return None


def _admit_ticket_html(reg, has_photo):
    exam = reg.exam
    font = "Segoe UI,Roboto,Arial,sans-serif"
    photo = (
        f"<img src='cid:candidate-photo' width='92' height='112' alt='Photo' style='display:block;margin:0 auto;width:92px;height:112px;object-fit:cover;border-radius:12px;border:3px solid #ffffff'>"
        if has_photo else
        f"<div style='margin:0 auto;width:92px;height:112px;border-radius:12px;background:#e0e7ff;font:800 34px/112px {font};color:#4338ca;text-align:center'>{escape(reg.first_name[:1].upper())}</div>"
    )
    def cell(label, value):
        return (f"<td class='stack' width='50%' style='padding:10px 12px;vertical-align:top'>"
                f"<div style='font:700 10px/14px {font};letter-spacing:.12em;text-transform:uppercase;color:#6366f1'>{escape(label)}</div>"
                f"<div style='margin-top:3px;font:600 14px/20px {font};color:#0f172a'>{escape(value)}</div></td>")
    reporting = exam.reporting_time.strftime("%I:%M %p") if exam.reporting_time else "—"
    return f"""
    <tr><td style='padding:4px 32px 8px' class='px'>
      <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='border-radius:18px;overflow:hidden;border:1px solid #c7d2fe;background:#ffffff'>
        <tr><td bgcolor='#312e81' style='background:#312e81;background-image:linear-gradient(120deg,#312e81,#4f46e5 70%,#7c3aed);padding:18px'>
          <table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>
            <td class='stack ticket-photo' width='108' align='center' style='vertical-align:middle;padding-right:14px'>{photo}</td>
            <td class='stack' style='vertical-align:middle'>
              <div style='font:700 10px/14px {font};letter-spacing:.16em;text-transform:uppercase;color:#c7d2fe'>Admit card · {escape(exam.code)}</div>
              <div style='margin-top:4px;font:800 20px/26px {font};color:#ffffff'>{escape(reg.full_name)}</div>
              <div style='margin-top:2px;font:500 13px/18px {font};color:#e0e7ff'>S/o / D/o {escape(reg.father_name)}</div>
              <table role='presentation' cellpadding='0' cellspacing='0' style='margin-top:12px'><tr>
                <td style='background:#ffffff;border-radius:10px;padding:8px 14px'>
                  <div style='font:700 9px/12px {font};letter-spacing:.14em;text-transform:uppercase;color:#6d28d9'>Roll number</div>
                  <div style='font:800 24px/28px {font};letter-spacing:.08em;color:#1e1b4b'>{escape(reg.roll_no)}</div>
                </td>
              </tr></table>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style='border-top:2px dashed #c7d2fe'>
          <table role='presentation' width='100%' cellpadding='0' cellspacing='0'>
            <tr>{cell("Exam date", f"{exam.exam_date:%a, %d %b %Y}")}{cell("Exam time", exam.exam_time or "Will be announced")}</tr>
            <tr>{cell("Reporting time", reporting)}{cell("Registration no.", reg.registration_no)}</tr>
            <tr>{cell("Class / Qualification", class_level_label(reg.class_level) or "—")}{cell("Subject", reg.subject)}</tr>
            <tr><td colspan='2' style='padding:0'><table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>{cell("School", reg.school_name or "—")}</tr></table></td></tr>
            <tr><td colspan='2' style='padding:0'><table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>{cell("Venue", exam.venue or "Will be announced")}</tr></table></td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>"""


def build_admit_card(reg, **_):
    exam = reg.exam
    link = f"{_site()}/api/v1/stre/admit-card/{reg.access_token}/download/"
    photo = _photo_bytes(reg)
    html = render(
        preheader=f"Your STRE admit card is ready — Roll no. {reg.roll_no}, exam on {exam.exam_date:%d %b %Y}",
        badge="Admit card ready", badge_color="#0284c7",
        title="Your admit card is ready 🎫", greeting=f"Dear {reg.full_name},",
        intro="Your admit card for the Student Talent Recognition Exam has been issued. Download it, print it and bring it to the exam centre with a valid photo ID.",
        custom_html=_admit_ticket_html(reg, bool(photo)),
        cta=("Download & print admit card", link),
        show_cta_link=False,
        note=[
            "Reach the exam centre before the reporting time.",
            "Carry the printed admit card and a photo ID (Aadhaar / school ID card).",
            "Mobile phones, calculators and smart watches are not allowed in the exam hall.",
            "Check your name and details. If anything is wrong, raise a support request on the STRE page.",
        ],
    )
    text = [f"Dear {reg.full_name},", f"Your admit card is ready. Roll number: {reg.roll_no}.", f"Exam: {exam.title} on {exam.exam_date:%d %b %Y}", f"Venue: {exam.venue or 'will be announced'}", f"Download: {link}"]
    images = [("candidate-photo", photo[0], photo[1])] if photo else None
    return f"🎫 STRE admit card — Roll no. {reg.roll_no}", text, html, images


def build_announcement(reg, subject="", message="", **_):
    paragraphs = [p.strip() for p in (message or "").split("\n") if p.strip()]
    rows = [("Registration no.", reg.registration_no)]
    if reg.roll_no:
        rows.append(("Roll no.", reg.roll_no))
    html = render(
        preheader=subject or "Update from the STRE exam cell",
        badge="Update", badge_color="#4f46e5",
        title=subject or "Update from the exam cell", greeting=f"Dear {reg.full_name},",
        intro=" ".join(paragraphs[:1]) or "Here is an update about STRE.",
        rows=rows,
        cta=("View my registration", status_link(reg)),
        note=paragraphs[1:] or None,
    )
    text = [f"Dear {reg.full_name},", *paragraphs, f"Registration number: {reg.registration_no}", f"Status: {status_link(reg)}"]
    return subject or "Update from the STRE exam cell", text, html


def build_result(reg, **_):
    from .models import StreResult

    exam = reg.exam
    res = StreResult.objects.filter(registration=reg).first()
    link = f"{_site()}/stre/result?token={reg.access_token}"
    if res is None or res.is_absent or res.marks is None:
        value, label = ("Absent" if res and res.is_absent else "—"), "Result"
        rows = [("Roll no.", reg.roll_no), ("Exam", exam.title)]
        intro = "The result of the exam has been declared. Our records show you were absent." if res and res.is_absent else "The result of the exam has been declared."
    else:
        label, value = "Your rank", f"#{res.rank}" if res.rank else "—"
        rows = [("Roll no.", reg.roll_no), ("Marks", f"{res.marks.normalize():f} / {exam.total_marks}"), ("Percentage", f"{res.percentage}%"), ("Certificate", res.award)]
        intro = "Congratulations! The result is out. You can view your result and download your certificate from the link below."
    html = render(
        preheader=f"{exam.title} result is out — Roll no. {reg.roll_no}",
        badge="Result declared", badge_color="#7c3aed",
        title=f"{exam.title} — Result", greeting=f"Dear {reg.full_name},", intro=intro,
        highlight_label=label, highlight_value=value, rows=rows,
        cta=("View result & certificate", link),
    )
    text = [f"Dear {reg.full_name},", f"The result of {exam.title} is out.", *[f"{k}: {v}" for k, v in rows], f"View: {link}"]
    return f"🏆 {exam.title} result — Roll no. {reg.roll_no}", text, html


BUILDERS = {
    "registration": build_registration,
    "payment": build_payment,
    "admit_card": build_admit_card,
    "result": build_result,
    "announcement": build_announcement,
}


def deliver(reg, kind, *, subject="", message="", connection=None, log_entry=None, batch=None):
    """Email banao, bhejo aur StreEmailLog me record karo. Returns True/False."""
    from django.utils import timezone

    from .models import StreEmailLog

    built = BUILDERS[kind](reg, subject=subject, message=message)
    built_subject, text, html = built[:3]
    images = built[3] if len(built) > 3 else None
    if log_entry is None:
        log_entry = StreEmailLog.objects.create(
            registration=reg, kind=kind, subject=built_subject, message=message, to_email=reg.email, batch=batch,
        )
    ok, error = _send(reg.email, built_subject, text, html, connection=connection, inline_images=images)
    log_entry.attempts += 1
    log_entry.subject = built_subject
    log_entry.to_email = reg.email
    log_entry.status = StreEmailLog.Status.SENT if ok else StreEmailLog.Status.FAILED
    log_entry.error = "" if ok else error
    if ok:
        log_entry.sent_at = timezone.now()
    log_entry.save(update_fields=["attempts", "subject", "to_email", "status", "error", "sent_at"])
    return ok


def send_registration_received(reg):
    return deliver(reg, "registration")


def send_payment_confirmed(reg):
    return deliver(reg, "payment")


def send_admit_card(reg, connection=None, log_entry=None, batch=None):
    return deliver(reg, "admit_card", connection=connection, log_entry=log_entry, batch=batch)


def send_test_email(to):
    html = render(
        preheader="Your STRE portal email is working.",
        badge="Test email", badge_color="#4f46e5",
        title="Email is working 🎉", greeting="Hello,",
        intro="This is a test email from the STRE exam portal. Registration, payment and admit card emails will look like this.",
        highlight_label="Status", highlight_value="Connected",
        rows=[("Sent from", getattr(settings, "DEFAULT_FROM_EMAIL", "")), ("Website", _site())],
        cta=("Open STRE portal", f"{_site()}/stre"),
    )
    message = EmailMultiAlternatives("Oshitech STRE | Email delivery test", "Purpose: Verify STRE portal email delivery.\n\nThis is a test email from the STRE exam portal. Registration, payment, and admit card emails use this delivery service.", getattr(settings, "DEFAULT_FROM_EMAIL", None), [to])
    message.attach_alternative(html, "text/html")
    message.send(fail_silently=False)



def _support_link():
    return f"{_site()}/stre/status"


def send_support_ack(ticket):
    html = render(
        preheader=f"We received your request {ticket.ticket_no}",
        badge="Support request", badge_color="#7c3aed",
        title="We received your request", greeting=f"Dear {ticket.name},",
        intro="Thank you for contacting the STRE exam cell. Our team will look into it and reply to this email address.",
        highlight_label="Ticket number", highlight_value=ticket.ticket_no,
        rows=[("Topic", ticket.get_category_display()), ("Subject", ticket.subject), ("Registration no.", ticket.registration_no or "—")],
    )
    ok, _ = _send(ticket.email, f"STRE support request {ticket.ticket_no} received", [f"Dear {ticket.name},", "We received your request.", f"Ticket: {ticket.ticket_no}", f"Subject: {ticket.subject}"], html)
    return ok


def send_support_reply(ticket):
    paragraphs = [p.strip() for p in (ticket.admin_reply or "").split("\n") if p.strip()]
    html = render(
        preheader=f"Reply to your request {ticket.ticket_no}",
        badge="Resolved" if ticket.status == "resolved" else "Reply", badge_color="#059669" if ticket.status == "resolved" else "#0284c7",
        title="Reply from the STRE exam cell", greeting=f"Dear {ticket.name},",
        intro=paragraphs[0] if paragraphs else "Your request has been updated.",
        highlight_label="Ticket number", highlight_value=ticket.ticket_no,
        rows=[("Your subject", ticket.subject), ("Status", ticket.get_status_display())],
        cta=("Check my registration", _support_link()),
        note=paragraphs[1:] or None,
    )
    ok, _ = _send(ticket.email, f"Re: {ticket.subject} [{ticket.ticket_no}]", [f"Dear {ticket.name},", *paragraphs, f"Ticket: {ticket.ticket_no} ({ticket.get_status_display()})"], html)
    return ok



def send_otp(email, code):
    html = render(
        preheader=f"Your STRE verification code is {code}",
        badge="Email verification", badge_color="#7c3aed",
        title="Verify your email", greeting="Hello,",
        intro="Use this one-time password (OTP) to verify your email for STRE registration. It is valid for 10 minutes.",
        highlight_label="Your OTP", highlight_value=" ".join(code),
        note=["Do not share this code with anyone. The exam cell will never ask for it.", "If you did not request this, you can ignore this email."],
    )
    ok, _ = _send(email, f"{code} is your STRE verification code", [f"Your STRE verification code is {code}.", "It is valid for 10 minutes. Do not share it with anyone."], html)
    return ok
