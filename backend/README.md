# Oshitech Education ERP — Backend

Django 5 + DRF + PostgreSQL. Multi-tenant (each school's data is isolated), role-based, secure cookie login.

## Structure
```
backend/
├── config/            settings (base/dev/prod), urls, celery
├── scripts/           backup.ps1 / restore.ps1 (PostgreSQL + media)
└── apps/
    ├── core/          BaseModel (UUID), TenantModel, roles, permissions, TenantModelViewSet, AuditLog, support
    ├── accounts/      Custom User (email login), cookie-JWT auth, lockout, password reset (email OTP)
    ├── schools/       School (plan: standard/premium)
    ├── academics/     AcademicYear, Course, Subject, ClassRoom, TeachingAssignment
    ├── teachers/      Teacher profiles, ratings
    ├── students/      Students, ID cards, promotion, bulk import
    ├── attendance/    Daily attendance and summaries
    ├── campus/        Notices (with PDF), timetable, homework, leave, fees
    ├── exams/         Exam, Schedule, AdmitCard (QR), Result (lock/publish)
    └── stre/          STRE talent exam: registration, Cashfree payments, admit cards, results, certificates
```

## Run (local)
```
python -m venv .venv
.venv\Scripts\activate          # Windows   (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env          # fill in your own values
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```
Swagger docs (development only): http://localhost:8000/api/docs/

Tests: `python manage.py test`

Useful commands:
- `python manage.py createstreadmin` — create the STRE (exam portal) admin account
- `python manage.py stre_sync_payments` — confirm STRE payments that are paid on Cashfree but still pending
  (the server also does this automatically every 2 minutes; add it to cron in production as a backup)

## Production (Docker + Postgres + Nginx load balancer)
Copy `backend/.env.example` to `backend/.env` and set the production secrets and configuration, then run
from the repository root:
```
docker compose -f backend/docker-compose.yml up --build
```
Only Nginx's port 80 is published on the host; frontend, backend, database and Redis stay on the internal
network. The upstream proxy/load balancer that terminates HTTPS must send `X-Forwarded-Proto: https`.

Replicas:
```
docker compose -f backend/docker-compose.yml up --build --scale backend=3 --scale frontend=2
```
Migrations run once before the replicas start.

## API (prefix /api/v1)
| Area | Endpoint |
|---|---|
| Auth | `auth/csrf/`, `auth/login/`, `auth/refresh/`, `auth/logout/`, `auth/me/`, `auth/forgot-password/` |
| Admin | `schools/`, `schools/{id}/create-admin/`, `audit-logs/` |
| School | `academics/academic-years|courses|subjects|classrooms|teaching-assignments/` |
| People | `teachers/`, `students/`, `id-cards/` |
| Students | `students/promote/`, `students/promotions/`, `students/undo-promotion/`, `students/import/`, `students/import-template/` |
| Campus | `notices/`, `notice-files/{id}/`, `timetable/`, `homework/`, `leave-requests/`, `fee-*`, `public-notices/` |
| Exam | `exams/exams/`, `exams/schedules/`, `exams/admit-cards/`, `exams/results/`, `exams/verify/{code}/` |
| Exam actions | `exams/exams/{id}/generate-admit-cards|publish-results|unlock-results/` |
| STRE (public) | `stre/public/`, `stre/register/`, `stre/status/`, `stre/pay/order/`, `stre/pay/verify/`, `stre/pay/cashfree-webhook/`, `stre/result/`, `stre/certificate/verify/{code}/` |
| STRE (admin) | `stre/admin/registrations/`, `stre/admin/results/…`, `stre/admin/exams/`, `stre/admin/notices/`, `stre/admin/support/`, `stre/admin/bulk-email/` |

## Login flow from Next.js
1. `GET auth/csrf/` (sets the `csrftoken` cookie)
2. `POST auth/login/` (sets httpOnly auth cookies)
3. Every unsafe request sends the header `X-CSRFToken: <csrftoken cookie>` with `credentials: "include"`
4. On 401, call `POST auth/refresh/`

## Security already in place
Argon2 password hashing, 10+ character password rule, httpOnly cookies, CSRF checks, short-lived access
token with rotating/blacklisted refresh tokens, idle sign-out (30 min) and absolute session limit (12 h),
login throttling with a 15-minute lockout after 5 failures, UUID IDs, every query scoped to the school,
cross-school foreign keys blocked, role permissions, audit log (down to marks edits), result publish =
lock, encrypted Aadhaar numbers, captcha and email OTP on public STRE pages, verified Cashfree webhooks,
HSTS/SSL/secure cookies in production, and a secret admin URL.

## Next steps
Server-side PDFs (Celery), 2FA for admins/teachers, online payment for school fees, SMS/WhatsApp alerts,
S3 storage for uploads.
