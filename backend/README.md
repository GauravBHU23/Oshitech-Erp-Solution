# Oshitech Education ERP: Backend

Django 5 + DRF + PostgreSQL. Multi-tenant (har school ka data alag), role-based, secure cookie login.

## Structure
```
backend/
├── config/            settings (base/dev/prod), urls, celery
└── apps/
    ├── core/          BaseModel (UUID), TenantModel, roles, permissions, TenantModelViewSet, AuditLog
    ├── accounts/      Custom User (email login), cookie-JWT auth, lockout
    ├── schools/       School (plan: standard/premium)
    ├── academics/     AcademicYear, Course, Subject, ClassRoom, TeachingAssignment
    ├── teachers/      Teacher portal data
    ├── students/      Student portal data
    └── exams/         Exam, Schedule, AdmitCard (QR code), Result (lock/publish)
```

## Run (local)
```
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```
Swagger docs (sirf dev): http://localhost:8000/api/docs/

Tests: `python manage.py test`

## Production (Docker + Postgres + Nginx load balancer)
`backend/.env.example` ko `backend/.env` me copy karke Django production secrets/configuration set karein, phir
repository root se
`docker compose -f backend/docker-compose.yml up --build` chalayein. Host par sirf Nginx ka port 80 publish hota
hai; frontend, backend, database aur Redis internal network par rehte hain. HTTPS terminate karne wala upstream
proxy/load balancer `X-Forwarded-Proto: https` bheje.

Replicas:
`docker compose -f backend/docker-compose.yml up --build --scale backend=3 --scale frontend=2`

Migrations replicas start hone se pehle ek baar chalti hain.

## API (prefix /api/v1)
| Area | Endpoint |
|---|---|
| Auth | `auth/csrf/`, `auth/login/`, `auth/refresh/`, `auth/logout/`, `auth/me/` |
| Admin | `schools/`, `schools/{id}/create-admin/`, `audit-logs/` |
| School | `academics/academic-years|courses|subjects|classrooms|teaching-assignments/` |
| Teacher / Student | `teachers/`, `students/` |
| Exam | `exams/exams/`, `exams/schedules/`, `exams/admit-cards/`, `exams/results/`, `exams/verify/{code}/` |
| Exam actions | `exams/exams/{id}/generate-admit-cards|publish-results|unlock-results/` |

## Next.js se login flow
1. `GET auth/csrf/` (csrftoken cookie milti hai)
2. `POST auth/login/` (httpOnly cookies set)
3. Har unsafe request par header `X-CSRFToken: <csrftoken cookie>`, aur `credentials: "include"`
4. 401 par `POST auth/refresh/`

## Security jo already lagi hai
Argon2 hashing, 10+ char password rule, httpOnly cookies, CSRF check, 15 min access token + rotating/blacklisted refresh,
login throttle + 5 fail par 15 min lockout, UUID IDs, har query school-scoped, cross-school FK block,
role permissions, audit log (marks edit tak), result publish = lock, HSTS/SSL/secure cookies (prod), secret admin URL.

## Baaki (next steps)
Admit card/marksheet PDF + QR (Celery), 2FA (admin/teacher), sensitive-field encryption, fee module, attendance, SMS/email, S3 uploads.
