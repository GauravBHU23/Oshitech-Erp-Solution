"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dashCardsFor, navFor } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/types";
import Icon from "@/components/Icon";
import AdminOverviewPanel from "@/components/AdminOverviewPanel";
import NoticeWidget from "@/components/NoticeWidget";
import StreAdminDashboard from "@/components/StreAdminDashboard";

const COPY: Record<string, { title: string; body: string; accent: string }> = {
  super_admin: { title: "Your schools, at a glance.", body: "Manage school accounts and keep an eye on platform activity.", accent: "Platform administration" },
  school_admin: { title: "Run your school from one place.", body: "Manage people, academic setup and examinations with a clear view of daily operations.", accent: "School administration" },
  teacher: { title: "Ready for your next class?", body: "Your assigned classes, students and marks entry are all in one workspace.", accent: "Teacher workspace" },
  exam_controller: { title: "Exams, organized end to end.", body: "Plan schedules, issue admit cards and manage result publishing.", accent: "Examination office" },
  stre_admin: { title: "STRE exam portal", body: "Registrations, payments and admit cards.", accent: "Upcoming exam" },
  student: { title: "Your learning, all in one place.", body: "Check your profile, exam timetable, admit cards and published results.", accent: "Student portal" },
};
const ICONS: Record<string, string> = { Schools: "school", "People & Accounts": "users", Teachers: "teacher", Students: "student", Courses: "book", Exams: "exam", "My Classes": "classroom", Classrooms: "classroom", "Upcoming Exams": "calendar", "My Admit Cards": "ticket", "My Results": "chart", "Admit Cards": "ticket", "Results entered": "check", "My Profile": "student", "My ID Card": "idcard", "ID Cards": "idcard", "ID Cards issued": "idcard", Classes: "book" };
const GROUPS: Record<string, { title: string; links: { label: string; href: string; icon: string }[] }> = {
  school_admin: { title: "Manage your school", links: [{ label: "Accounts & access", href: "/manage/accounts", icon: "key" }, { label: "People & accounts", href: "/manage/users", icon: "users" }, { label: "Academic years", href: "/manage/academic-years", icon: "calendar" }, { label: "Courses & subjects", href: "/manage/courses", icon: "book" }, { label: "Classes & assignments", href: "/manage/teaching-assignments", icon: "classroom" }, { label: "Teachers & students", href: "/manage/teachers", icon: "users" }, { label: "Exams & schedules", href: "/manage/exams", icon: "exam" }, { label: "Attendance", href: "/attendance", icon: "calendarCheck" }, { label: "ID cards", href: "/id-cards", icon: "idcard" }, { label: "Bulk marks entry", href: "/marks-entry", icon: "check" }, { label: "Report cards", href: "/report-cards", icon: "award" }] },
  teacher: { title: "Your teaching workspace", links: [{ label: "Take attendance", href: "/attendance", icon: "calendarCheck" }, { label: "My classes & subjects", href: "/manage/teaching-assignments", icon: "classroom" }, { label: "My students", href: "/manage/students", icon: "student" }, { label: "Enter marks (whole class)", href: "/marks-entry", icon: "check" }, { label: "Report cards", href: "/report-cards", icon: "award" }, { label: "ID cards", href: "/id-cards", icon: "idcard" }] },
  exam_controller: { title: "Examination desk", links: [{ label: "Manage exams", href: "/manage/exams", icon: "exam" }, { label: "Exam schedules", href: "/manage/schedules", icon: "calendar" }, { label: "Admit cards", href: "/admit-cards", icon: "ticket" }, { label: "Bulk marks entry", href: "/marks-entry", icon: "check" }, { label: "Results", href: "/manage/results", icon: "chart" }, { label: "Report cards", href: "/report-cards", icon: "award" }] },
  student: { title: "Your student services", links: [{ label: "My ID card", href: "/id-cards", icon: "idcard" }, { label: "My attendance", href: "/attendance", icon: "calendarCheck" }, { label: "Exam timetable", href: "/manage/schedules", icon: "calendar" }, { label: "Download admit card", href: "/admit-cards", icon: "ticket" }, { label: "My report card", href: "/report-cards", icon: "award" }, { label: "My profile", href: "/manage/students", icon: "student" }] },
  stre_admin: { title: "Exam portal", links: [{ label: "Registrations", href: "/stre-admin/registrations", icon: "users" }] },
  super_admin: { title: "Platform tools", links: [{ label: "Manage schools", href: "/manage/schools", icon: "school" }, { label: "People & accounts", href: "/manage/users", icon: "users" }, { label: "Registration approvals", href: "/manage/accounts", icon: "key" }, { label: "ID cards", href: "/id-cards", icon: "idcard" }, { label: "Audit activity", href: "/manage/audit-logs", icon: "clock" }] },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [today, setToday] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const cards = useMemo(() => user ? dashCardsFor(user.role) : [], [user]);
  const actions = useMemo(() => user ? GROUPS[user.role].links : [], [user]);
  const shortcuts = useMemo(() => user ? navFor(user.role).filter((item) => item.href !== "/dashboard").slice(0, 4) : [], [user]);
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setToday(new Intl.DateTimeFormat("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(now));
      setCurrentTime(new Intl.DateTimeFormat("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
        timeZoneName: "short",
      }).format(now));
    };
    updateClock();
    const clockTimer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(clockTimer);
  }, []);
  useEffect(() => {
    if (user?.role !== "super_admin" && !user?.school) return;
    const refreshDashboard = () => {
      cards.forEach((card) => api<{ count: number }>(`${card.endpoint}?page_size=1`).then((d) => setCounts((s) => ({ ...s, [card.label]: d.count }))).catch(() => {}));
    };
    refreshDashboard();
    const timer = window.setInterval(refreshDashboard, 30_000);
    return () => window.clearInterval(timer);
  }, [cards, user?.role, user?.school]);
  if (!user) return null;
  if (user.role === "stre_admin") return <StreAdminDashboard name={user.first_name || user.email} />;
  const copy = COPY[user.role];
  const isAdmin = user.role === "super_admin" || user.role === "school_admin";
  return <div className={`mx-auto max-w-7xl space-y-7 ${isAdmin ? "admin-dashboard" : ""}`}>
    <section className="dashboard-hero relative isolate overflow-hidden rounded-3xl bg-[#18243b] px-6 py-8 text-white shadow-xl shadow-slate-200 sm:px-9 sm:py-10"><div className="absolute -right-12 -top-24 -z-10 h-72 w-72 rounded-full bg-indigo-500/30 blur-3xl" /><div className="absolute bottom-[-130px] right-[22%] -z-10 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" /><div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-2xl"><div className="dashboard-hero-badge mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-indigo-100"><span className="h-2 w-2 rounded-full bg-emerald-400" />{copy.accent}</div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{copy.title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">{copy.body}</p><p className="mt-6 text-sm text-indigo-100">Welcome back, <span className="font-semibold text-white">{user.first_name || user.email}</span></p></div><div className="dashboard-hero-date rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-right backdrop-blur"><div className="text-xs text-slate-300">Today</div><div className="mt-1 text-sm font-medium">{today || "Welcome"}</div><time className="mt-1 block text-xs tabular-nums text-slate-200" aria-label="Current time in India">{currentTime || "—"}</time><div className="mt-2 text-xs text-indigo-200">{ROLE_LABEL[user.role]}</div></div></div></section>
    {user.role !== "super_admin" && !user.school && <section role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"><h2 className="font-semibold">School setup required</h2><p className="mt-1 leading-6">This account is not assigned to a school, so school data and management actions are unavailable. Ask the Super Admin to create or select your school and link this account.</p></section>}
    <section aria-label="Portal overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card, index) => <Link key={card.label} href={card.href} className={`group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md ${isAdmin ? "portal-admin-card" : ""}`}><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon name={ICONS[card.label] ?? "layers"} /></span><span className="flex items-center gap-1 text-xs font-medium text-slate-400">VIEW <Icon name="external" size={13} /></span></div><div className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">{counts[card.label] ?? "—"}</div><div className="mt-1 text-sm text-slate-500">{card.label}</div><div className={`mt-4 h-1 w-12 rounded-full ${["bg-indigo-500", "bg-cyan-500", "bg-violet-500", "bg-emerald-500"][index % 4]}`} /></Link>)}</section>
    {(user.role === "school_admin" || user.role === "super_admin") && (user.role === "super_admin" || user.school) && <AdminOverviewPanel platformAdmin={user.role === "super_admin"} />}
    {(user.role === "super_admin" || user.school) && <NoticeWidget />}
    <section className="grid gap-5 xl:grid-cols-[1.55fr_1fr]"><div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Quick access</p><h2 className="mt-1 text-lg font-semibold text-slate-900">{GROUPS[user.role].title}</h2></div><span className="hidden text-xs text-slate-400 sm:block">Choose a workspace to continue</span></div><div className="grid gap-3 sm:grid-cols-2">{actions.map((item) => <Link key={item.href} href={item.href} className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 transition hover:border-indigo-200 hover:bg-indigo-50/60"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-indigo-700 shadow-sm"><Icon name={item.icon} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-800">{item.label}</span><span className="mt-0.5 block text-xs text-slate-400">Open workspace</span></span><Icon name="arrow" className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" size={16} /></Link>)}</div></div>
      <aside className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 ${isAdmin ? "admin-portal-panel" : ""}`}><p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Your portal</p><h2 className="mt-1 text-lg font-semibold text-slate-900">At a glance</h2><div className="mt-5 divide-y divide-slate-100">{shortcuts.map((item, i) => <Link key={item.href} href={item.href} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">0{i + 1}</span><span className="flex-1 text-sm font-medium text-slate-700">{item.label}</span><Icon name="external" className="text-slate-400" size={14} /></Link>)}</div><div className="mt-6 rounded-xl bg-[#f5f6ff] p-4"><div className="flex items-center gap-2 text-sm font-medium text-slate-800"><Icon name="layers" className="text-indigo-600" size={16} /> One place for everyday work</div><p className="mt-1.5 text-xs leading-5 text-slate-500">Your menu is tailored to your role. Use the left navigation to switch sections any time.</p></div></aside>
    </section>
  </div>;
}
