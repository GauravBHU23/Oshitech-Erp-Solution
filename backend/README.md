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
copy .env.example .env          # fill in your own values; .env.local can override for local runs
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
Production settings now refuse to start with sample secrets, an invalid Aadhaar key, SQLite, a weak
PostgreSQL password, localhost-only hosts, an HTTP `SITE_URL`, or the default/placeholder admin path.
Set `REDIS_CACHE_URL` to a Redis instance reachable by every backend replica; DRF throttles and shared
cache locks use it. Terminate HTTPS at the public load balancer and forward `X-Forwarded-Proto: https`.
Outgoing email uses GoDaddy Professional Email SMTP by default (`smtpout.secureserver.net:465` with SSL). Set
`EMAIL_HOST_USER=admin@oshitech.in` and store the Titan mailbox password in `EMAIL_HOST_PASSWORD`
through the hosting provider's secret settings. Do not commit the password. Production refuses to start
without authenticated SMTP settings; local development falls back to console email if credentials are absent.
The admin email tool permits Super Admins to send one message to one address, while School Admins can
send only to active accounts in their own school. Requests are limited to 10 per admin per hour and audited.
STRE Admin announcements remain scoped to STRE candidates through the existing Email Center.
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
2. `GET auth/captcha/` (returns a one-use, five-minute login challenge)
3. `POST auth/login/` (send `captcha_id` and `captcha` with the credentials; sets httpOnly auth cookies)
4. Every unsafe request sends the header `X-CSRFToken: <csrftoken cookie>` with `credentials: "include"`
5. On 401, call `POST auth/refresh/`

## Security already in place
Argon2 password hashing, 10+ character password rule, httpOnly cookies, CSRF checks, short-lived access
token with rotating/blacklisted refresh tokens, server-enforced idle sign-out (30 min) and absolute session limit (12 h),
atomic throttling shared through Redis across production workers, one-use CAPTCHA challenges on portal and Django admin sign-in,
a 15-minute lockout after 5 failures, UUID IDs, every query scoped to the school,
cross-school foreign keys blocked, role permissions, audit log (down to marks edits), result publish =
lock, encrypted Aadhaar numbers, captcha and email OTP on public STRE pages, verified Cashfree webhooks,
HSTS/SSL/secure cookies in production, and a secret admin URL. Every protected API request validates its
signed JWT session id against shared server state. Logout and password changes revoke sessions across
tabs and backend replicas. Django admin sessions also expire on idle and at the absolute limit.

Private API views default to authentication. Login, refresh, health, public notices, registration,
payment webhooks, and verification/lookups intentionally remain anonymous and retain their own CAPTCHA,
OTP, signature or rate-limit controls.

## Next steps
Server-side PDFs (Celery), 2FA for admins/teachers, online payment for school fees, SMS/WhatsApp alerts,
S3 storage for uploads.
