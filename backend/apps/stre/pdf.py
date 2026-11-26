"""PDF documents for STRE candidates."""
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from reportlab.pdfbase.pdfmetrics import stringWidth

from .models import class_level_label


INDIGO = colors.HexColor("#312e81")
VIOLET = colors.HexColor("#4f46e5")
SLATE = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748b")
LINE = colors.HexColor("#cbd5e1")
PALE = colors.HexColor("#f1f5f9")


def _text(value):
    """Keep built-in PDF font encoding safe for candidate-entered text."""
    return str(value or "").encode("cp1252", "replace").decode("cp1252")


def _wrap(value, font, size, width):
    words = _text(value).split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and stringWidth(candidate, font, size) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def _draw_wrapped(pdf, value, x, y, width, *, font="Helvetica", size=9, leading=12, max_lines=3):
    pdf.setFont(font, size)
    for line in _wrap(value, font, size, width)[:max_lines]:
        pdf.drawString(x, y, line)
        y -= leading
    return y


def _draw_image(pdf, field, x, y, width, height):
    if not field:
        return
    with field.open("rb") as image_file:
        pdf.drawImage(ImageReader(image_file), x, y, width, height, preserveAspectRatio=True, anchor="c", mask="auto")


def create_admit_card_pdf(registration, site_url):
    """Render a one-page, downloadable STRE admit card PDF."""
    exam = registration.exam
    buffer = BytesIO()
    page_width, page_height = A4
    pdf = canvas.Canvas(buffer, pagesize=A4, pageCompression=1)
    pdf.setTitle(f"STRE Admit Card - {registration.roll_no}")
    pdf.setAuthor("STRE Exam Cell")

    margin = 38
    content_width = page_width - 2 * margin

    pdf.setFillColor(INDIGO)
    pdf.rect(0, page_height - 105, page_width, 105, fill=1, stroke=0)
    crest_cx, crest_cy, crest_r = margin + 20, page_height - 52, 20
    pdf.setFillColor(colors.white)
    pdf.circle(crest_cx, crest_cy, crest_r, fill=1, stroke=0)
    pdf.setFillColor(INDIGO)
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawCentredString(crest_cx, crest_cy - 7, "O")
    pdf.setFillColor(colors.HexColor("#c7d2fe"))
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawCentredString(page_width / 2, page_height - 32, "STUDENT TALENT RECOGNITION EXAM")
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 19)
    pdf.drawCentredString(page_width / 2, page_height - 58, _text(exam.title).upper())
    pdf.setFont("Helvetica", 10)
    pdf.drawCentredString(page_width / 2, page_height - 77, f"ADMIT CARD  |  {_text(exam.code)}")
    pdf.setStrokeColor(colors.HexColor("#f59e0b"))
    pdf.setLineWidth(3)
    pdf.line(0, page_height - 105, page_width, page_height - 105)

    y = page_height - 132
    pdf.setFillColor(PALE)
    pdf.setStrokeColor(LINE)
    pdf.roundRect(margin, y - 54, content_width, 54, 9, fill=1, stroke=1)
    pdf.setFillColor(VIOLET)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(margin + 14, y - 18, "ROLL NUMBER")
    pdf.setFillColor(INDIGO)
    pdf.setFont("Helvetica-Bold", 21)
    pdf.drawString(margin + 14, y - 43, _text(registration.roll_no))
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawRightString(page_width - margin - 14, y - 18, "REGISTRATION NUMBER")
    pdf.setFillColor(SLATE)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawRightString(page_width - margin - 14, y - 40, _text(registration.registration_no))
    y -= 70

    pdf.setFillColor(VIOLET)
    pdf.rect(margin, y - 18, 3, 18, fill=1, stroke=0)
    pdf.setFillColor(INDIGO)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(margin + 9, y - 13, "CANDIDATE DETAILS")

    photo_width, photo_height = 78, 100
    photo_x, photo_y = page_width - margin - photo_width, y - 132
    pdf.setStrokeColor(LINE)
    pdf.setFillColor(colors.white)
    pdf.roundRect(photo_x, photo_y, photo_width, photo_height, 4, fill=1, stroke=1)
    _draw_image(pdf, registration.photo, photo_x + 3, photo_y + 3, photo_width - 6, photo_height - 6)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7)
    pdf.drawCentredString(photo_x + photo_width / 2, photo_y - 10, "CANDIDATE PHOTO")

    fields = [
        ("Candidate name", registration.full_name),
        ("Father's name", registration.father_name),
        ("Subject", registration.subject),
        ("Class / Qualification", class_level_label(registration.class_level) or "—"),
        ("School / College", registration.school_name or "—"),
        ("Aadhaar", f"XXXX XXXX {registration.aadhaar_last4}" if registration.aadhaar_last4 else "—"),
        ("Mobile", registration.mobile),
        ("Email", registration.email),
    ]
    details_x = margin
    details_width = content_width - photo_width - 16
    col_gap = 12
    col_width = (details_width - col_gap) / 2
    field_height = 31
    for index, (label, value) in enumerate(fields):
        row, col = divmod(index, 2)
        x = details_x + col * (col_width + col_gap)
        top = y - 25 - row * field_height
        pdf.setStrokeColor(LINE)
        pdf.line(x, top - 22, x + col_width, top - 22)
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawString(x, top - 8, _text(label).upper())
        pdf.setFillColor(SLATE)
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(x, top - 19, _text(value)[:55])

    y -= 154
    pdf.setFillColor(VIOLET)
    pdf.rect(margin, y - 18, 3, 18, fill=1, stroke=0)
    pdf.setFillColor(INDIGO)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(margin + 9, y - 13, "EXAM SCHEDULE")
    y -= 28

    exam_date = exam.exam_date.strftime("%d %b %Y")
    reporting = exam.reporting_time.strftime("%I:%M %p") if exam.reporting_time else "—"
    schedule = [
        ("EXAM DATE", exam_date),
        ("EXAM TIME", exam.exam_time or "—"),
        ("REPORTING TIME", reporting),
        ("EXAM CODE", exam.code),
    ]
    cell_gap = 8
    cell_width = (content_width - 3 * cell_gap) / 4
    for index, (label, value) in enumerate(schedule):
        x = margin + index * (cell_width + cell_gap)
        pdf.setFillColor(PALE)
        pdf.setStrokeColor(LINE)
        pdf.roundRect(x, y - 43, cell_width, 43, 5, fill=1, stroke=1)
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawString(x + 8, y - 15, label)
        pdf.setFillColor(SLATE)
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(x + 8, y - 31, _text(value)[:24])
    y -= 56

    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(margin, y, "EXAM CENTRE / VENUE")
    y -= 8
    y = _draw_wrapped(pdf, exam.venue or "Will be announced", margin, y, content_width, font="Helvetica-Bold", size=10, leading=13, max_lines=2) - 8
    pdf.setStrokeColor(LINE)
    pdf.line(margin, y, page_width - margin, y)
    y -= 18

    pdf.setFillColor(INDIGO)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(margin, y, "IMPORTANT INSTRUCTIONS")
    y -= 14
    instructions = exam.instructions.splitlines() if exam.instructions else [
        "Bring this admit card and a photo ID (Aadhaar / school ID).",
        "Reach the centre before the reporting time.",
        "Mobile phones, calculators and smart watches are not allowed.",
    ]
    for index, instruction in enumerate(instructions[:5], start=1):
        pdf.setFillColor(VIOLET)
        pdf.setFont("Helvetica-Bold", 8)
        pdf.drawString(margin + 2, y, f"{index}.")
        pdf.setFillColor(SLATE)
        y = _draw_wrapped(pdf, instruction, margin + 18, y, content_width - 18, size=8, leading=10, max_lines=2) - 2

    sig_y = 72
    sig_width = 88
    _draw_image(pdf, registration.signature, margin + 15, sig_y + 10, sig_width, 24)
    pdf.setStrokeColor(SLATE)
    pdf.line(margin, sig_y + 8, margin + 120, sig_y + 8)
    pdf.line(page_width - margin - 120, sig_y + 8, page_width - margin, sig_y + 8)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 8)
    pdf.drawCentredString(margin + 60, sig_y - 4, "Candidate signature")
    pdf.drawCentredString(page_width - margin - 60, sig_y - 4, "Invigilator signature")

    qr = QrCodeWidget(f"{site_url.rstrip('/')}/stre/verify/{registration.roll_no}")
    bounds = qr.getBounds()
    qr_size = 58
    drawing = Drawing(qr_size, qr_size, transform=[
        qr_size / (bounds[2] - bounds[0]), 0, 0,
        qr_size / (bounds[3] - bounds[1]), 0, 0,
    ])
    drawing.add(qr)
    renderPDF.draw(drawing, pdf, page_width - margin - qr_size, 30)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 6)
    pdf.drawCentredString(page_width - margin - qr_size / 2, 22, "SCAN TO VERIFY")
    pdf.setStrokeColor(LINE)
    pdf.line(margin, 28, page_width - margin - qr_size - 10, 28)
    pdf.setFont("Helvetica", 7)
    pdf.drawString(margin, 16, f"Issued {registration.admit_card_issued_at:%d %b %Y} | Computer-generated admit card")

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def create_registration_pdf(registration, site_url):
    """Registration confirmation PDF — available as soon as payment succeeds (paid or
    admit_card_issued), independent of the admit card itself (which is issued later by
    the exam cell and carries a roll number this document never has)."""
    exam = registration.exam
    buffer = BytesIO()
    page_width, page_height = A4
    pdf = canvas.Canvas(buffer, pagesize=A4, pageCompression=1)
    pdf.setTitle(f"STRE Registration - {registration.registration_no}")
    pdf.setAuthor("STRE Exam Cell")

    margin = 38
    content_width = page_width - 2 * margin

    pdf.setFillColor(INDIGO)
    pdf.rect(0, page_height - 105, page_width, 105, fill=1, stroke=0)
    crest_cx, crest_cy, crest_r = margin + 20, page_height - 52, 20
    pdf.setFillColor(colors.white)
    pdf.circle(crest_cx, crest_cy, crest_r, fill=1, stroke=0)
    pdf.setFillColor(INDIGO)
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawCentredString(crest_cx, crest_cy - 7, "O")
    pdf.setFillColor(colors.HexColor("#c7d2fe"))
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawCentredString(page_width / 2, page_height - 32, "STUDENT TALENT RECOGNITION EXAM")
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 19)
    pdf.drawCentredString(page_width / 2, page_height - 58, _text(exam.title).upper())
    pdf.setFont("Helvetica", 10)
    pdf.drawCentredString(page_width / 2, page_height - 77, f"REGISTRATION CONFIRMATION  |  {_text(exam.code)}")
    pdf.setStrokeColor(colors.HexColor("#22c55e"))
    pdf.setLineWidth(3)
    pdf.line(0, page_height - 105, page_width, page_height - 105)

    y = page_height - 132
    pdf.setFillColor(PALE)
    pdf.setStrokeColor(LINE)
    pdf.roundRect(margin, y - 54, content_width, 54, 9, fill=1, stroke=1)
    pdf.setFillColor(VIOLET)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(margin + 14, y - 18, "REGISTRATION NUMBER")
    pdf.setFillColor(INDIGO)
    pdf.setFont("Helvetica-Bold", 21)
    pdf.drawString(margin + 14, y - 43, _text(registration.registration_no))
    pdf.setFillColor(colors.HexColor("#15803d"))
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawRightString(page_width - margin - 14, y - 18, "PAYMENT STATUS")
    pdf.setFillColor(colors.HexColor("#15803d"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawRightString(page_width - margin - 14, y - 40, "PAID" if registration.amount else "NO FEE DUE")
    y -= 70

    pdf.setFillColor(VIOLET)
    pdf.rect(margin, y - 18, 3, 18, fill=1, stroke=0)
    pdf.setFillColor(INDIGO)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(margin + 9, y - 13, "CANDIDATE DETAILS")

    photo_width, photo_height = 78, 100
    photo_x, photo_y = page_width - margin - photo_width, y - 132
    pdf.setStrokeColor(LINE)
    pdf.setFillColor(colors.white)
    pdf.roundRect(photo_x, photo_y, photo_width, photo_height, 4, fill=1, stroke=1)
    _draw_image(pdf, registration.photo, photo_x + 3, photo_y + 3, photo_width - 6, photo_height - 6)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7)
    pdf.drawCentredString(photo_x + photo_width / 2, photo_y - 10, "CANDIDATE PHOTO")

    fields = [
        ("Candidate name", registration.full_name),
        ("Father's name", registration.father_name),
        ("Subject", registration.subject),
        ("Class / Qualification", class_level_label(registration.class_level) or "—"),
        ("School / College", registration.school_name or "—"),
        ("Mobile", registration.mobile),
        ("Email", registration.email),
        ("Registered on", registration.created_at.strftime("%d %b %Y")),
    ]
    details_x = margin
    details_width = content_width - photo_width - 16
    col_gap = 12
    col_width = (details_width - col_gap) / 2
    field_height = 31
    for index, (label, value) in enumerate(fields):
        row, col = divmod(index, 2)
        x = details_x + col * (col_width + col_gap)
        top = y - 25 - row * field_height
        pdf.setStrokeColor(LINE)
        pdf.line(x, top - 22, x + col_width, top - 22)
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawString(x, top - 8, _text(label).upper())
        pdf.setFillColor(SLATE)
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(x, top - 19, _text(value)[:55])

    y -= 4 * field_height + 32

    pdf.setFillColor(VIOLET)
    pdf.rect(margin, y - 18, 3, 18, fill=1, stroke=0)
    pdf.setFillColor(INDIGO)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(margin + 9, y - 13, "PAYMENT DETAILS")
    y -= 28

    payment_cells = [
        ("AMOUNT PAID", f"Rs. {registration.amount:,.2f}" if registration.amount else "No fee due"),
        ("PAYMENT METHOD", (registration.payment_method or "—").upper()),
        ("PAYMENT REFERENCE", registration.payment_reference or "—"),
    ]
    cell_gap = 8
    cell_width = (content_width - 2 * cell_gap) / 3
    for index, (label, value) in enumerate(payment_cells):
        x = margin + index * (cell_width + cell_gap)
        pdf.setFillColor(PALE)
        pdf.setStrokeColor(LINE)
        pdf.roundRect(x, y - 43, cell_width, 43, 5, fill=1, stroke=1)
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawString(x + 8, y - 15, label)
        pdf.setFillColor(SLATE)
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(x + 8, y - 31, _text(value)[:28])
    y -= 60

    pdf.setFillColor(INDIGO)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(margin, y, "WHAT HAPPENS NEXT")
    y -= 14
    next_steps = [
        "Keep this confirmation safe — it is proof of a successful registration and payment.",
        "The exam cell will issue your admit card closer to the exam date.",
        "Check your registration status anytime with your registration number and mobile number.",
    ]
    for index, step in enumerate(next_steps, start=1):
        pdf.setFillColor(VIOLET)
        pdf.setFont("Helvetica-Bold", 8)
        pdf.drawString(margin + 2, y, f"{index}.")
        pdf.setFillColor(SLATE)
        y = _draw_wrapped(pdf, step, margin + 18, y, content_width - 18, size=8, leading=10, max_lines=2) - 2

    qr = QrCodeWidget(f"{site_url.rstrip('/')}/stre/status?token={registration.access_token}")
    bounds = qr.getBounds()
    qr_size = 58
    drawing = Drawing(qr_size, qr_size, transform=[
        qr_size / (bounds[2] - bounds[0]), 0, 0,
        qr_size / (bounds[3] - bounds[1]), 0, 0,
    ])
    drawing.add(qr)
    renderPDF.draw(drawing, pdf, page_width - margin - qr_size, 30)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 6)
    pdf.drawCentredString(page_width - margin - qr_size / 2, 22, "SCAN FOR STATUS")
    pdf.setStrokeColor(LINE)
    pdf.line(margin, 28, page_width - margin - qr_size - 10, 28)
    pdf.setFont("Helvetica", 7)
    pdf.drawString(margin, 16, f"Generated {registration.updated_at:%d %b %Y} | Computer-generated registration confirmation")

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
