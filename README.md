# Oshitech Education ERP

A complete, role-based ERP for schools and colleges, plus a separate public portal for the
**STRE (Student Talent Recognition Exam)**.

```
oshitech-erp/
├── backend/    Django 5 + DRF + PostgreSQL   (API, security, roles, STRE)
└── frontend/   Next.js 14 + TypeScript + Tailwind   (website, login, portals, PWA)
```

## Run locally (two terminals)

**Terminal 1 — backend**
```
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows   (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env          # then fill in your own values
python manage.py migrate
python manage.py createsuperuser    # Super Admin (email + password)
python manage.py runserver          # http://localhost:8000
```

**Terminal 2 — frontend**
```
cd frontend
copy .env.example .env.local    # API_URL=http://localhost:8000
npm install
npm run dev                     # http://localhost:3000
```

All browser API calls go through the same-origin `/api/...` proxy, so the backend URL is set in one
place only (`API_URL`). When exposing the backend with ngrok or a domain, set `API_URL` to the backend's
HTTPS origin (for example `https://<your-backend-domain>`, without `/api`) and restart the dev server.
In production, rebuild/redeploy the frontend after changing environment values.

**Maintenance mode:** set `MAINTENANCE_MODE=true` in `frontend/.env.local` and restart/redeploy the
frontend. Every page shows the maintenance screen; the API, support form, static assets and
`/maintenance` stay available. Set it back to `false` when done.

### Database
Settings read `DATABASE_URL` from `backend/.env`. Without it, a local SQLite file is used (development
only). For real use, point it to PostgreSQL:
```
DATABASE_URL=postgres://erp:<password>@localhost:5432/erp
```

## First-time setup
1. Log in as **Super Admin** → **Schools** → create the school/college → **Create admin** (that school's admin).
2. Log in as **School Admin** → fill in address/phone in **School Profile** (printed on ID cards and admit cards).
3. **Academic Years** → create the current year → on **Courses** click **Create Class 1–12**
   (creates Classes 1–12 with common subjects in one click; colleges can add their own courses).
4. **Classrooms** (sections A, B…) → **Teachers** → **Teacher Assignments** → **Students** (pick class + section),
   or use **Import Students** to admit many students from Excel/CSV.
   An **ID card is issued automatically** on admission (and when a teacher joins).
5. Teachers mark daily **Attendance** for their classes (Present / Absent / Late / Leave).
6. **Exams** → create an exam → add subjects in **Exam Schedule** → **Generate admit cards**.
7. Teachers / Exam Controller enter marks for a whole class with **Bulk Marks Entry** →
   School / Exam admin **Publish results** (results get locked) → print **Report Cards** (grade + rank).
8. At the end of the session, use **Promote Students** to move each class to the next class and session.
9. Students log in to see their ID card, attendance, admit card (with QR) and results/report card
   (only after results are published).

## Portals (menu and permissions depend on the role)
| Role | Can do |
|---|---|
| Super Admin | All schools, create school admins, all data, audit logs |
| School Admin | Everything for their own school: profile, classes, teachers, students, ID cards, attendance, exams, results, fees, promotion, import, accounts |
| Teacher | Only their own classes: students, attendance, marks for their subjects, homework, report cards, ID cards |
| Exam Controller | Exams, schedule, admit cards, marks, publish results, report cards, students' ID cards (read-only) |
| Student | Own profile, ID card, attendance, timetable, homework, fees, exam schedule, admit card, published results / report card, teacher rating |
| Exam Portal Admin (STRE) | STRE registrations, payments, admit cards, results, notices and support — no access to school data |

## School ERP features
- **ID cards:** issued automatically on admission/joining; front and back (photo, class, blood group,
  father's and mother's name, parent phone); QR verification (`/verify-id/<code>`); reissue (old QR stops
  working) or revoke; 2 cards per A4 page. An **Issue missing cards** button covers older records.
- **Attendance:** class-wise daily marking, monthly summary and percentage; students see their own attendance.
- **Bulk marks entry:** a whole class for one exam + subject; if any row is invalid, nothing is saved.
- **Report cards:** total, percentage, grade (A1–E), pass/fail and class rank; print a whole class at once.
- **Classes 1–12:** one-click setup, class filters for students and ID cards, "Class N" labels everywhere.
- **Promote Students:** move a class to the next class and new session in one step — promote, detain or
  mark as passed out per student; optional new section, roll-number reset, ID card validity extension;
  seat/capacity checks; full **undo** of any promotion batch.
- **Import Students:** download an Excel/CSV template, upload it, see row-by-row errors, then import.
  Logins and ID cards are created automatically; a login list (email + temporary password) can be
  downloaded for 24 hours. Students without an email get a login ID like `admissionno.schoolcode@student.local`.
- **Notice board:** notice / circular / holiday / event, targeted by audience (everyone, students,
  teachers, staff) and class; optional **PDF attachment**; public notices appear on the website.
- **Timetable:** period-wise timetable (teacher double-booking is blocked); weekly grid for everyone,
  "My teaching schedule" for teachers; printable.
- **Homework:** teachers post homework to their classes; students see their class homework.
- **Leave:** students, teachers and exam controllers apply for leave; the class teacher or admin
  approves student leave, the admin approves staff leave.
- **Fees:** class-wise fee structure → one-click invoices for all students → record payments
  (cash/UPI/card/bank/cheque) → printable receipt (amount in words). Discounts, late fine, balance and
  overdue status. Students see their invoices and receipts in **My Fees**. Teachers and exam controllers
  have no access to fees.
- **Forgot password:** email OTP reset for every portal; only accounts that exist (and match the portal's
  role) can reset.
- **Contact Us** (`/contact`): admission/fees/general enquiries; entering a school code sends the
  enquiry straight to that school's Support Inbox. Contact details come from `NEXT_PUBLIC_CONTACT_*`.
- **Terms & Conditions** (`/terms`) and **Privacy Policy** (`/privacy`).

## STRE — Student Talent Recognition Exam
A separate public portal (`/stre`) that never touches school ERP data.
- **Registration** with email OTP verification, school name, address, class, subject, interests,
  aim of life, Aadhaar (stored encrypted), photo and signature (any size — resized in the browser).
- **Payments (Cashfree):** online checkout on the site. Payments are confirmed **automatically** — on the
  checkout callback, by the Cashfree webhook, when the status page opens, and by a background check every
  2 minutes. A registration is **confirmed only after payment**; unpaid registrations do not appear in the
  admin list (an "Unpaid" filter is available for support).
- **After payment, automatically:** roll number → admit card → emails (payment receipt + admit card).
- **Status page** with captcha (registration number + mobile) and printable **admit card** with QR verification.
- **Results:** enter marks in a table or upload Excel, automatic ranks (ties share a rank), merit list
  export, an **ON/OFF switch** to show the result on the website, result emails, and printable
  **Certificates of Merit / Participation** with QR verification (`/stre/verify-certificate/<code>`).
- **Admin tools:** edit or delete registrations, bulk email with a failed-email resend list,
  support tickets, notices (with PDF), exams and fees.

## Platform
- **PWA:** installable (install card in the footer and portal sidebar; on iPhone: Share → Add to Home
  Screen), offline page; private API data is never cached.
- **Dark / light mode** on every page, applied before the page paints (no white flash); follows the
  system theme the first time.
- **Session security:** automatic sign-out after 30 minutes of inactivity and after 12 hours in total;
  the backend checks the signed session id on every protected API request, and logout/password changes
  revoke sessions across tabs and backend replicas.
- **Mobile friendly:** responsive layouts, hamburger menu on the website, sticky portal top bar.

## Architecture
In Docker deployment, all browser traffic goes through the Nginx load balancer (`http://localhost`):
`/api/` and the configured admin path go to Django, `/static/` to the static volume, and everything
else to Next.js. Uploaded files are only served by Django API views that apply their access checks;
Nginx does not expose the media volume directly. Database, Redis, Django and Next.js ports are not
published on the host.
Tokens live in httpOnly cookies, so JavaScript cannot read them. The local two-terminal setup above uses
the Next.js API rewrite instead.

## Docker deployment / scaling
Copy `backend/.env.example` to `backend/.env` and set production secrets and settings, then run:
```
docker compose -f backend/docker-compose.yml up --build
```
Only Nginx's port 80 is published. An external proxy/load balancer that terminates TLS must send the
`X-Forwarded-Proto: https` header — HTTPS is required for secure cookies. To scale:
```
docker compose -f backend/docker-compose.yml up --build --scale backend=3 --scale frontend=2
```
Nginx discovers replicas through Docker DNS; migrations run once before the replicas start. In
production, configure strong values for Postgres credentials, Django secrets, allowed hosts, CSRF
trusted origins, `SITE_URL` and `CASHFREE_NOTIFY_URL`.

## Backups
`backend/scripts/backup.ps1` backs up the PostgreSQL database (`pg_dump`) and the `media` folder to
`%USERPROFILE%\OshitechBackups` (change with `BACKUP_DIR`), keeping 14 days (`BACKUP_KEEP_DAYS`).
Schedule it daily with Windows Task Scheduler. Restore with:
```
powershell -ExecutionPolicy Bypass -File backend\scripts\restore.ps1 -DumpFile <db_*.dump> [-MediaZip <media_*.zip>]
```
Point `BACKUP_DIR` to a Google Drive / OneDrive folder to keep an off-site copy.

## Secrets
Never commit `.env` files. Use `backend/.env.example` and `frontend/.env.example` as templates and keep
real keys (Cashfree, email, database, encryption key) only on the server.

## Current limitations
- Dropdowns load up to 200 records at a time (tables show all records with pagination).
- PDFs are produced with the browser's Print / Save as PDF; no server-side PDF generation yet.
- Online payment for school fees, SMS/WhatsApp alerts, 2FA, and library, transport and hostel modules
  are not built yet.
- To test a production build alongside the dev server, use `NEXT_DIST_DIR=.next-prod npm run build`
  so the dev server's `.next` folder is not overwritten.
