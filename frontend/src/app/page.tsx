"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import Icon from "@/components/Icon";
import MarketingFooter from "@/components/MarketingFooter";
import SiteHeader from "@/components/SiteHeader";
import PublicTicker from "@/components/PublicTicker";
import PublicNoticeBoard from "@/components/PublicNoticeBoard";
import TeacherDirectory from "@/components/TeacherDirectory";
import PublicOverview from "@/components/PublicOverview";

const modules = [
  { n: "01", icon: "book", title: "Academic foundation", text: "Set academic years, courses, subjects and classrooms in one connected structure." },
  { n: "02", icon: "users", title: "People & profiles", text: "Keep teacher and student records organized, with role based access to the right information." },
  { n: "03", icon: "classroom", title: "Teaching assignments", text: "Connect teachers with their classes and subjects so their workspace stays focused." },
  { n: "04", icon: "calendar", title: "Examination planning", text: "Create exams and subject schedules with dates, timings, venues and marks." },
  { n: "05", icon: "ticket", title: "Admit cards & QR", text: "Generate student admit cards with exam details and a QR code for verification." },
  { n: "06", icon: "chart", title: "Results & report cards", text: "Enter a whole class's marks at once, publish with a lock, and print report cards with grade and rank." },
  { n: "07", icon: "calendarCheck", title: "Daily attendance", text: "Teachers mark class attendance in one tap; students and admins see monthly percentages." },
  { n: "08", icon: "idcard", title: "ID cards with QR", text: "An identity card is issued automatically on admission, ready to print and verify by QR." },
];
const portals = [
  { icon: "settings", title: "School administrator", text: "Set up academic records, manage staff and students, plan exams and review school activity.", tone: "bg-indigo-50 text-indigo-700" },
  { icon: "teacher", title: "Teacher", text: "See assigned classes and students, check exam details and enter marks for assigned subjects.", tone: "bg-sky-50 text-sky-700" },
  { icon: "ticket", title: "Exam controller", text: "Coordinate exams, subject schedules, admit cards and the result publishing process.", tone: "bg-amber-50 text-amber-700" },
  { icon: "student", title: "Student", text: "Find your profile, exam timetable, personal admit cards and published results.", tone: "bg-emerald-50 text-emerald-700" },
  { icon: "school", title: "Platform administrator", text: "Manage school workspaces and review platform level audit activity.", tone: "bg-violet-50 text-violet-700" },
];
const loginPortals = [
  { title: "School Admin Portal", href: "/login/school-admin", icon: "settings", tone: "bg-indigo-50 text-indigo-700" },
  { title: "Super Admin Portal", href: "/login/super-admin", icon: "shield", tone: "bg-violet-50 text-violet-700" },
  { title: "Teacher Admin Portal", href: "/login/teacher", icon: "teacher", tone: "bg-sky-50 text-sky-700" },
  { title: "Exam Controller Admin Portal", href: "/login/exam-controller", icon: "ticket", tone: "bg-amber-50 text-amber-700" },
  { title: "Student Login Portal", href: "/login/student", icon: "student", tone: "bg-emerald-50 text-emerald-700" },
];

function PreviewPanel() {
  return <div className="relative mx-auto w-full max-w-[570px]">
    <div className="absolute -inset-5 rounded-[34px] bg-gradient-to-br from-violet-500/30 via-indigo-500/10 to-cyan-300/20 blur-2xl" />
    <div className="relative overflow-hidden rounded-[25px] border border-white/15 bg-[#111b30] shadow-2xl shadow-indigo-950/50">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 text-sm font-bold text-white">O</span><div><div className="text-xs font-semibold text-white">Oshitech ERP</div><div className="text-[10px] text-slate-500">School workspace</div></div></div><span className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-2.5 py-1 text-[10px] text-emerald-200">Platform preview</span></div>
      <div className="grid min-h-[350px] grid-cols-[112px_1fr] sm:grid-cols-[145px_1fr]">
        <div className="border-r border-white/[0.07] p-3"><div className="mb-3 px-2 text-[9px] font-semibold uppercase tracking-[.16em] text-slate-600">Workspace</div>{[["home", "Overview"], ["book", "Academics"], ["users", "People"], ["exam", "Examinations"], ["ticket", "Admit cards"]].map(([i, t], n) => <div key={t} className={`mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-[10px] ${n === 0 ? "bg-indigo-500/20 text-white" : "text-slate-500"}`}><Icon name={i} size={13} /><span className="truncate">{t}</span></div>)}</div>
        <div className="p-4 sm:p-5"><div className="flex items-start justify-between"><div><div className="text-[10px] text-slate-500">School administration</div><div className="mt-1 text-base font-semibold text-white">A connected school day</div></div><div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-200 to-orange-400" /></div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">{[["Academic years", "Courses · subjects", "calendar"], ["People", "Teachers · students", "users"], ["Classrooms", "Classes · assignments", "classroom"], ["Examinations", "Schedules · results", "exam"]].map(([a, b, icon], i) => <div key={a} className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3"><div className={`mb-3 grid h-7 w-7 place-items-center rounded-lg ${["bg-indigo-400/15 text-indigo-200", "bg-sky-400/15 text-sky-200", "bg-violet-400/15 text-violet-200", "bg-amber-400/15 text-amber-200"][i]}`}><Icon name={icon} size={14} /></div><div className="text-[11px] font-medium text-slate-200">{a}</div><div className="mt-1 text-[9px] text-slate-500">{b}</div></div>)}</div>
          <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-medium text-slate-300">A connected workflow</span><span className="text-[9px] text-slate-600">ACADEMICS / EXAMS</span></div><div className="flex items-center gap-1.5">{["Courses", "Classes", "Exam", "Results"].map((t, i) => <div key={t} className="flex min-w-0 flex-1 items-center gap-1.5"><div className="min-w-0 flex-1 rounded-md bg-white/[0.05] px-1.5 py-2 text-center text-[8px] text-slate-400 sm:text-[9px]">{t}</div>{i < 3 && <Icon name="arrow" size={11} className="text-indigo-300" />}</div>)}</div></div>
        </div>
      </div>
    </div>
  </div>;
}

export default function Home() {
  const { user } = useAuth();
  return <main className="home-page overflow-hidden bg-white text-slate-900">
    <SiteHeader />
    <PublicTicker />

    <section id="overview" className="scroll-mt-32 relative isolate overflow-hidden bg-[#0e172a] text-white"><div className="absolute inset-0 -z-10 opacity-30" style={{ backgroundImage: "radial-gradient(#8795b8 0.7px, transparent 0.7px)", backgroundSize: "20px 20px" }} /><div className="absolute -left-40 top-[-180px] -z-10 h-[480px] w-[480px] rounded-full bg-indigo-700/30 blur-[100px]" /><div className="absolute right-[-140px] bottom-[-260px] -z-10 h-[550px] w-[550px] rounded-full bg-cyan-500/15 blur-[110px]" />
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-9 sm:px-8 sm:py-14 lg:grid-cols-[.92fr_1.08fr] lg:gap-10 lg:py-16"><div className="animate-rise-in"><div className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/[0.08] px-3.5 py-1.5 text-[11px] font-medium text-indigo-100"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />A smarter school operations platform</div><h1 className="mt-4 max-w-2xl text-[32px] font-semibold leading-[1.1] tracking-[-.04em] sm:mt-6 sm:text-5xl lg:text-[56px]">Every part of your school, <span className="bg-gradient-to-r from-indigo-300 via-sky-200 to-cyan-200 bg-clip-text text-transparent">working together.</span></h1><p className="mt-6 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">Bring academic setup, people, classes and examinations into one connected ERP. Give administrators, teachers and students a portal built around what they need to do.</p><div className="mt-8 flex flex-wrap items-center gap-3"><Link href={user ? "/dashboard" : "/login"} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#172238] shadow-lg transition hover:-translate-y-0.5 hover:bg-indigo-50">{user ? "Go to your workspace" : "Sign in to your portal"}<Icon name="arrow" size={17} /></Link><a href="#platform" className="rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/[0.07]">Explore the platform</a></div><div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-300"><span className="inline-flex items-center gap-1.5"><Icon name="users" size={14} /> Separate role based portals</span><span className="inline-flex items-center gap-1.5"><Icon name="school" size={14} /> School scoped records</span><span className="inline-flex items-center gap-1.5"><Icon name="exam" size={14} /> Exam to result workflow</span></div></div><div className="hidden md:block"><PreviewPanel /></div></div>
    </section>

    <PublicOverview />

    <PublicNoticeBoard />

    <section id="platform" className="scroll-mt-32 bg-[#f8f9fc] px-4 py-10 sm:px-8 sm:py-14"><div className="mx-auto max-w-7xl"><div className="mx-auto max-w-2xl text-center"><p className="text-[11px] font-bold uppercase tracking-[.2em] text-indigo-600">The platform</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">The everyday work of a school, connected.</h2><p className="mt-4 text-sm leading-6 text-slate-500 sm:text-base">A clear structure for academic records and exams, with each person working from their own portal.</p></div><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{modules.map((m) => <article key={m.n} className="group rounded-2xl border border-slate-200/80 bg-white p-5 transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/50 sm:p-6"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-700 transition group-hover:bg-indigo-600 group-hover:text-white"><Icon name={m.icon} /></span><span className="text-xs font-semibold tracking-widest text-slate-300">{m.n}</span></div><h3 className="mt-5 text-base font-semibold text-slate-900">{m.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{m.text}</p></article>)}</div></div></section>

    <section id="portals" className="scroll-mt-32 px-4 py-10 sm:px-8 sm:py-14"><div className="mx-auto max-w-7xl"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-indigo-600">One ERP · focused portals</p><h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Everyone sees what they need. Nothing extra.</h2></div><p className="max-w-md text-sm leading-6 text-slate-500">Role based access helps keep school records in the right hands, while common workflows stay connected.</p></div><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{portals.map((p) => <article key={p.title} className="flex gap-4 rounded-2xl border border-slate-200/80 p-5 sm:p-6"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${p.tone}`}><Icon name={p.icon} /></span><div><h3 className="text-sm font-semibold text-slate-900">{p.title}</h3><p className="mt-2 text-xs leading-5 text-slate-500 sm:text-sm">{p.text}</p></div></article>)}</div></div></section>

    <section id="about" className="scroll-mt-32 bg-slate-50 px-4 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[.85fr_1.15fr] lg:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-indigo-600">About Oshitech</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Education workflows, connected in one place.
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Oshitech Education ERP brings school operations, learning workflows, and exam services together through clear, role-based portals for school administrators, teachers, students, and exam teams.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Connected school workflows", "Manage academic operations and school records through one shared platform."],
            ["Purpose-built portals", "Give administrators, teachers, students, and exam teams the views and tools relevant to their role."],
            ["Clear application journeys", "Students and teachers can apply online, with school review and approval built into the process."],
          ].map(([title, text]) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>

    <TeacherDirectory />

    <section id="security" className="scroll-mt-32 bg-[#111b30] px-4 py-10 text-white sm:px-8 sm:py-14"><div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-cyan-200">Built for responsible access</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">School records stay in the right workspace.</h2><p className="mt-4 max-w-lg text-sm leading-6 text-slate-300">Oshitech keeps portal access tied to each person&apos;s role and school. Student and teacher applications are reviewed by the school admin; profiles stay inactive until approved and placed.</p><Link href={user ? "/dashboard" : "/login"} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#172238] transition hover:bg-indigo-50">{user ? "Open your workspace" : "Choose your portal"}<Icon name="arrow" size={16} /></Link></div><div className="grid gap-3 sm:grid-cols-2">{[["shield", "School scoped records", "School data is separated so each school works inside its own workspace."], ["lock", "Protected sign in", "Secure session cookies and request protection help safeguard portal access."], ["users", "Role based access", "Admin, teacher, student and exam controller have separate views and permissions."], ["chart", "Change history", "Important record changes and exam result actions are recorded for review."]].map(([icon, title, body]) => <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-300/10 text-cyan-200"><Icon name={icon} size={19} /></span><h3 className="mt-4 text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-400">{body}</p></article>)}</div></div></section>

    <section id="workflow" className="scroll-mt-32 bg-[#f8f9fc] px-4 py-10 sm:px-8 sm:py-14"><div className="mx-auto max-w-7xl"><div className="mx-auto max-w-2xl text-center"><p className="text-[11px] font-bold uppercase tracking-[.2em] text-indigo-600">A connected workflow</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">From academic setup to published results.</h2><p className="mt-4 text-sm leading-6 text-slate-500">The structure you create is used across classrooms, exams and student services.</p></div><div className="mt-7 grid gap-3 md:grid-cols-4">{[["01", "Set up academics", "Create the year, courses, subjects and classrooms."], ["02", "Add your people", "Create teacher and student profiles, then assign teaching responsibilities."], ["03", "Plan examinations", "Create exams, add subject schedules and generate admit cards."], ["04", "Enter & publish results", "Record marks, review results and publish them when ready."]].map(([n, t, d], i) => <div key={n} className="relative rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#20274a] text-xs font-semibold text-white">{n}</span>{i < 3 && <span className="hidden flex-1 border-t border-dashed border-slate-300 md:block" />}</div><h3 className="mt-5 text-sm font-semibold text-slate-900">{t}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{d}</p></div>)}</div></div></section>

    <section className="px-4 py-10 sm:px-8 sm:py-14"><div className="mx-auto max-w-7xl overflow-hidden rounded-[28px] bg-gradient-to-r from-[#1d2851] via-[#293a79] to-[#295779] px-6 py-10 text-white sm:px-10 sm:py-12"><div className="flex flex-col justify-between gap-7 md:flex-row md:items-center"><div className="max-w-2xl"><p className="text-[11px] font-bold uppercase tracking-[.2em] text-cyan-200">Oshitech Education ERP</p><h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Bring your school operations into one clear workspace.</h2><p className="mt-3 text-sm leading-6 text-indigo-100">Sign in to continue to your role based portal for school, teaching, examinations or student services.</p></div><Link href={user ? "/dashboard" : "/login"} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#20274a] transition hover:-translate-y-0.5 hover:bg-cyan-50">{user ? "Open dashboard" : "Go to portal login"}<Icon name="arrow" size={16} /></Link></div></div></section>

    <MarketingFooter />
  </main>;
}
