# Oshitech Education ERP

```
oshitech-erp/
├── backend/    Django + DRF + PostgreSQL   (API, security, roles)
└── frontend/   Next.js 14 + TypeScript + Tailwind   (login + 5 portals)
```

## Local run (2 terminal)

**Terminal 1: backend**
```
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser        # Super Admin (email + password)
python manage.py runserver              # http://localhost:8000
```

**Terminal 2: frontend**
```
cd frontend
cp .env.example .env.local              # API_URL=http://localhost:8000
npm install
npm run dev                             # http://localhost:3000
```

Ngrok se backend expose karne par `frontend/.env.local` me `API_URL` ko backend ke HTTPS
origin se replace karein (jaise `https://<your-backend-domain>`), `/api` path add na karein,
aur development server restart karein. Production me env badalne ke baad frontend dobara
build/deploy karein. Frontend ki saari API requests same-origin `/api/...` proxy se jayengi;
backend URL code me alag-alag jagah badalne ki zaroorat nahi hai.

Website maintenance ke liye `frontend/.env.local` me `MAINTENANCE_MODE=true` set karke
frontend restart/redeploy karein. Maintenance screen sab frontend pages par dikhegi; API,
support form, static assets aur `/maintenance` page accessible rahenge. Kaam poora hone par
`MAINTENANCE_MODE=false` set karke frontend restart/redeploy karein.

## Pehli baar kya karein
1. Super Admin se login karein → **Schools** → school/college banayein → **Create admin** (us school ka admin).
2. School Admin se login karein → **School Profile** me address/phone bharein (ID card aur admit card par chhapta hai).
3. **Academic Years** → current year banayein → **Courses** page par **Create Class 1–12** dabayein
   (Class 1 se 12 aur unke common subjects ek click me ban jaate hain; college ke liye apne course khud add karein).
4. **Classrooms** (section A, B…) → **Teachers** → **Teacher Assignments** → **Students** (class + section chunein).
   Student ka admission hote hi uska **ID card automatically issue** ho jata hai (teacher join karne par bhi).
5. Teacher **Attendance** me roz class ki haazri lagata hai (P / A / L / Leave).
6. **Exams** → exam banayein → **Exam Schedule** me subjects add karein → **Generate admit cards**.
7. Teacher/Exam Controller **Bulk Marks Entry** se poori class ke marks ek saath daalein →
   School/Exam admin **Publish results** (lock ho jata hai) → **Report Cards** print karein (grade + rank).
8. Student login: apna ID card, attendance, admit card (QR), aur result/report card sirf publish hone ke baad.

## Portals (role ke hisaab se menu aur permission)
| Role | Kya kar sakta hai |
|---|---|
| Super Admin | Saare schools, school admin banana, sab data, audit logs |
| School Admin | Apne school ka sab kuch: profile, classes, teachers, students, ID cards, attendance, exams, results, accounts |
| Teacher | Sirf apni classes ke students, attendance, apne subjects ke marks, report cards, apna aur apne students ka ID card |
| Exam Controller | Exams, schedule, admit cards, marks, publish results, report cards, students ke ID cards (read-only) |
| Student | Apna profile, ID card, attendance, exam schedule, admit card, published results/report card, teacher rating |

## Nayi features
- **ID cards**: admission/joining par auto-issue, front + back (photo, class, blood group, father & mother name, parent phone), QR verify
  (`/verify-id/<code>`), reissue (purana QR band) / revoke, 2 cards per A4 print. Purane students ke liye migration
  khud card bana deti hai; **Issue missing cards** button bhi hai.
- **Attendance**: class-wise daily marking, monthly summary aur percentage; student apni attendance dekhta hai.
- **Bulk marks entry**: ek exam + subject ke liye poori class; ek bhi row galat ho to kuch save nahi hota.
- **Report cards**: total, percentage, grade (A1–E), pass/fail, class rank; poori class ek saath print.
- **Class 1–12**: ek click setup, students/ID cards me class filter, har jagah "Class N" label.
- **PWA**: app install ho sakta hai (Chrome/Edge me "Install app" button, iPhone par Share → Add to Home Screen),
  offline page; private API data kabhi cache nahi hota.
- **Dark / light mode**: sirf **ek** toggle (har page par niche-baayein floating button); choice har page par lagti hai,
  page load se pehle apply hoti hai (white flash nahi) aur pehli baar system theme follow karti hai.
- **Notice board**: notice / circular / holiday / event; audience (sab, students, teachers, staff) aur class ke hisaab se
  dikhta hai; dashboard par latest notices. School Admin aur Exam Controller post kar sakte hain.
- **Timetable**: admin period-wise timetable banata hai (teacher ki double booking block hoti hai); sab ke liye weekly
  grid view, teacher ke liye "My teaching schedule", print.
- **Homework**: teacher sirf apni classes ko homework deta hai; student apni class ka homework dekhta hai.
- **Leave**: student/teacher/exam controller leave apply karte hain; student ki leave class teacher ya admin, staff ki
  leave admin approve/reject karta hai.
- **Fees**: fee structure (class-wise) → ek click me sab students ke invoices → payment record (cash/UPI/card/bank/
  cheque) → printable receipt (amount in words). Discount, late fine, balance, overdue status; student "My Fees" me
  apne invoices aur receipts dekhta hai. Teacher/exam controller ko fees ka access nahi.
- **Contact Us** (`/contact`): admission/fees/general enquiry; school code daalne par enquiry seedha us school ke
  Support Inbox me jati hai. Phone/email/address `frontend/.env.local` ke `NEXT_PUBLIC_CONTACT_*` se aate hain.
- **Mobile**: home page par hamburger menu, login portal pages par upar ka khaali space hata diya, portal ka top bar sticky.

## Architecture note
Docker deployment me browser ka saara traffic Nginx load balancer (`http://localhost`) se jata hai:
`/api/` aur configured admin path Django ko, `/static/` aur `/media/` shared volumes ko, aur baaki paths Next.js ko.
Database, Redis, Django aur Next.js ke ports host par publish nahi hote. Tokens httpOnly cookies me hain:
JavaScript unhe padh nahi sakti. Upar diye local two-terminal development setup me Next.js ka API rewrite use hota hai.

## Docker deployment / scaling
Pehle `backend/.env.example` ko `backend/.env` me copy karke production secrets/settings set karein. Phir
`docker compose -f backend/docker-compose.yml up --build`
chalayein. User traffic ke liye sirf Nginx load balancer ka port 80 publish hota hai; TLS terminate karne wale
external proxy/load balancer ko `X-Forwarded-Proto: https` header bhejna chahiye. Secure cookies ke liye HTTPS
zaroori hai. Backend/frontend replicas badhane ke liye udaharan:
`docker compose -f backend/docker-compose.yml up --build --scale backend=3 --scale frontend=2`.
Nginx Docker DNS ke zariye replicas ko discover karke traffic distribute karta hai; migrations replicas se pehle
ek baar chalti hain. Production me Postgres credentials, Django secrets, allowed hosts, aur CSRF trusted origins
ko strong environment values se configure karein.

## Limitations (abhi)
- Dropdowns me ek baar me max 200 records aate hain (tables me poore records pagination ke saath dikhte hain).
- PDF abhi browser Print / Save as PDF se; server-side PDF (Celery) baad me.
- 2FA, SMS/email notification, online payment gateway, library, transport aur hostel modules abhi nahi.
- Production build ko dev server ke saath test karna ho to `NEXT_DIST_DIR=.next-prod npm run build` use karein,
  taaki `npm run dev` ka `.next` folder overwrite na ho.
