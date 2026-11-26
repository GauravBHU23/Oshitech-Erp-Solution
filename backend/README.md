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
  (Celery Beat runs this automatically every 2 minutes; add it to cron in production as a backup)
- `python manage.py registration_report` — export every student/teacher registration request to a CSV
  (name, email, phone, school, status, review info), with role/status counts printed to the terminal.
  Add `--school <school-id>` to report on a single school only.

### Slow-query / N+1 investigation (django-silk)
Off by default. To investigate a slow endpoint or suspected N+1 problem:
1. Set `ENABLE_SILK=True` in your `.env` (or `ENABLE_SILK=True python manage.py runserver` for a one-off local run)
   and restart the server.
2. Reproduce the slow request while signed in as a staff user.
3. Visit `/silk/` (staff login required) to see every captured request with its SQL query count,
   timings, and the full list of queries — duplicate/repeated queries are the N+1 signal to look for.
4. Turn `ENABLE_SILK` back off when done; recording every query adds real overhead and should
   never be left on during normal production traffic.

## Production (Docker + Postgres + Nginx load balancer)
Copy `backend/.env.example` to `backend/.env` and set the production secrets and configuration.
FastAPI (`fast-backend`) has no `.env` of its own — it reads `backend/.env` directly (same
`DATABASE_URL`, same secrets), so there is nothing to configure separately for it.
`DATABASE_URL` must point at Postgres using `db` as the Docker hostname; Compose injects
`REDIS_CACHE_URL=redis://redis:6379/2` for both backends automatically. `POSTGRES_PASSWORD` must
be set in `backend/.env` and match the password in `DATABASE_URL`.
Then run from the repository root:
```
docker compose --env-file backend/.env -f backend/docker-compose.yml up --build
```
Production settings now refuse to start with sample secrets, an invalid Aadhaar key, SQLite, a weak
PostgreSQL password, localhost-only hosts, an HTTP `SITE_URL`, or the default/placeholder admin path.
Set `REDIS_CACHE_URL` to a Redis instance reachable by every backend replica; DRF throttles and shared
cache locks use it; public STRE metadata is cached for 30 seconds. Terminate HTTPS at the public load
balancer and forward `X-Forwarded-Proto: https`.
Outgoing email uses GoDaddy Professional Email SMTP by default (`smtpout.secureserver.net:465` with SSL). Set
`EMAIL_HOST_USER=admin@oshitech.in` and store the Titan mailbox password in `EMAIL_HOST_PASSWORD`
through the hosting provider's secret settings. Do not commit the password. Production refuses to start
without authenticated SMTP settings; local development falls back to console email if credentials are absent.
The admin email tool permits Super Admins to send one message to one address, while School Admins can
send only to active accounts in their own school. Requests are limited to 10 per admin per hour and audited.
STRE Admin announcements remain scoped to STRE candidates through the existing Email Center.
Only Nginx's port 80 is published publicly; frontend, backend, database, Redis, Celery worker and
Celery Beat stay on the internal network. Uptime Kuma and Netdata bind only to loopback at
`127.0.0.1:3001` and `127.0.0.1:19999` by default (change `UPTIME_KUMA_PORT` and `NETDATA_PORT`
to use other local ports). On a remote server, access them through SSH tunnels; create Uptime Kuma
monitors for the public site and `/api/health/`. Netdata collects Linux host CPU, memory, processes, disk and network metrics, plus per-container CPU,
memory, network and filesystem usage. It uses host networking for complete system metrics; both the
dashboard and a read-only Docker socket proxy are bound to loopback. The proxy is restricted to
container endpoints, and anonymous telemetry is disabled. Host filesystem mounts are read-only; do
not publish either monitoring port to the public internet. For example, use
`ssh -L 19999:127.0.0.1:19999 user@server` and
open `http://127.0.0.1:19999` locally. On Docker Desktop for Windows, host charts represent the
Docker Linux VM rather than the Windows host. Celery processes STRE bulk-email batches, and Beat queues
Cashfree payment reconciliation every two minutes; run a single Beat instance. `/api/` and the configured
admin URL are proxied to Django; `/fast-api/` is proxied to FastAPI with that prefix removed
(`/fast-api/api/health/` maps to FastAPI's `/api/health/`). The upstream
proxy/load balancer that terminates HTTPS must send `X-Forwarded-Proto: https`. FastAPI's interactive
API docs are available at `/fast-api/docs`.

Replicas:
```
docker compose --env-file backend/.env -f backend/docker-compose.yml up --build --scale backend=3 --scale frontend=2 --scale fast-backend=2
```
Migrations run once before the replicas start.

## Performance defaults
- The frontend image runs `npm run build` and `next start`, not the development server.
- FastAPI runs two Uvicorn workers per container; scale containers after checking CPU and memory.
- Nginx enables gzip, upstream keep-alive, and a one-hour browser cache for Django static files.
- Redis holds shared auth-session state, throttling counters, short-lived coordination locks, and the Celery broker queue.
- Redis caches only public STRE metadata for 30 seconds; do not cache authorization/permission results without versioned invalidation.
- Fee invoice lists and summaries aggregate payment totals in SQL instead of issuing payment queries per invoice.
- Student and teacher image uploads are resized in the browser; public teacher photos are lazy-loaded.
- STRE bulk email and scheduled Cashfree reconciliation run through Celery; password-bearing student imports remain in their current protected flow.
- Optional Sentry error reporting is wired for Django, FastAPI, and Next.js. Set `SENTRY_DSN` in the backend and FastAPI environment files, and `NEXT_PUBLIC_SENTRY_DSN` in `backend/.env` before building. Event configuration excludes request bodies, cookies, authorization headers, and query strings.

The API already has shared Redis-backed rate limits, login lockout, HTTPS redirect, secure cookies, and HSTS.
Nginx gzip is enabled; a Cloudflare CDN/WAF and origin TLS certificate still require the domain owner to
configure the external Cloudflare zone and HTTPS proxy. Do not cache `/api/` responses at the CDN.

PgBouncer is not enabled until PostgreSQL connection metrics show a need; extra pooling can complicate
transactions and migrations. Fail2ban is a host-level control, not a Compose service, and should only be
configured on the server after proxy client-IP handling is verified. Netdata provides host and container
resource dashboards; PostgreSQL query-level charts require a dedicated `pg_monitor` account and collector
configuration. Prometheus/Grafana remain optional and require exporters and secured dashboard access.
The encrypted backup script requires a host-level daily schedule and an off-site destination; verify a
restore before relying on it. Use PostgreSQL query plans and production statistics before adding indexes
or broad caches.

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
