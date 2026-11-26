"use client";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { toast } from "@/lib/toast";
import SessionGuard from "@/components/SessionGuard";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { canAccessPath, navFor, navGroupsFor } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/types";
import LoadingScreen from "@/components/LoadingScreen";
import Icon from "@/components/Icon";
import AdminNotifications from "@/components/AdminNotifications";
import { InstallAppCard } from "@/components/PwaInstall";

/** Account menu ko bahar click / Escape par band kare. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) close(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

const NAV_ICONS: Record<string, string> = { Dashboard: "home", Schools: "school", "School Profile": "school", "People & Accounts": "users", "Exam Controllers": "ticket", "Teacher Feedback": "star", "Rate Teachers": "star", "Support Inbox": "ticket", "Send Email": "megaphone", "Audit Logs": "clock", "Accounts & Access": "key", "Password Reset": "key", "Academic Years": "calendar", Courses: "book", Subjects: "layers", Classrooms: "classroom", "Teacher Assignments": "users", "My Classes & Subjects": "users", Teachers: "teacher", Students: "student", "My Students": "student", "My Profile": "student", Exams: "exam", "My Exams": "exam", "Upcoming Exams": "exam", "Exam Schedule": "calendar", "Admit Cards": "ticket", Results: "chart", "My Results": "chart", "Marks Entry": "check", "Bulk Marks Entry": "check", "ID Cards": "idcard", "My ID Card": "idcard", Attendance: "calendarCheck", "My Attendance": "calendarCheck", "Report Cards": "award", "My Report Card": "award", "Notice Board": "megaphone", "Weekly Timetable": "calendar", "My Timetable": "calendar", "Timetable Setup": "settings", Homework: "book", "Leave Requests": "clock", "Leave Applications": "clock", "Fees Overview": "wallet", "My Fees": "wallet", "Fee Structure": "layers", "Fee Invoices": "ticket", "Fee Payments": "check", "STRE Registrations": "users", "STRE Support": "ticket", "STRE Notices": "megaphone", "Exams & Fees": "calendar", "STRE Subjects": "book" };

export default function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useDismiss(accountOpen, () => setAccountOpen(false));
  useEffect(() => { if (!loading && !user) router.replace("/login"); }, [loading, user, router]);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => setAccountOpen(false), [pathname]);
  const navigation = useMemo(() => navGroupsFor(user?.role ?? "student"), [user?.role]);
  const items = useMemo(() => user ? navFor(user.role) : [], [user?.role]);
  const canAccessCurrentPath = !!user && canAccessPath(user.role, pathname, !!user.school || user.role === "super_admin" || user.role === "stre_admin");
  useEffect(() => {
    if (!loading && user && !canAccessCurrentPath) router.replace("/dashboard");
  }, [loading, user, canAccessCurrentPath, router]);
  const signOut = async () => {
    try {
      await logout();
      toast.success("You have been logged out.");
    } catch {
      toast.error("Logout could not be confirmed. Check your connection and try again.");
    } finally {
      router.replace("/login");
    }
  };
  const isAdmin = user?.role === "super_admin" || user?.role === "school_admin";
  const canUseSchoolAdminTools = user?.role === "super_admin" || !!user?.school;
  const active = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  const current = items.find((item) => active(item.href));
  useEffect(() => {
    if (!user) return;
    const activeGroup = navigation.groups.find((group) => group.items.some((item) => active(item.href)));
    if (activeGroup) setOpenGroups(Object.fromEntries(navigation.groups.map((group) => [group.label, group.label === activeGroup.label])));
  }, [navigation, pathname, user]);
  if (loading || !user) return <LoadingScreen />;
  if (!canAccessCurrentPath) return <LoadingScreen />;
  return <><SessionGuard idleMinutes={user.session?.idle_minutes ?? 30} /><div className={`portal-shell min-h-screen bg-[#f6f7fb] lg:flex ${isAdmin ? "portal-shell--admin" : ""}`}>
    <div className="portal-mobile-bar sticky top-0 z-[70] flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 lg:hidden no-print"><Link href="/dashboard" className="flex items-center gap-2.5 text-slate-900"><span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-lg font-bold text-white">O</span><span className="font-semibold">Oshitech <span className="font-normal text-slate-400">ERP</span></span></Link><div className="flex items-center gap-2">{isAdmin && canUseSchoolAdminTools && <AdminNotifications />}<ThemeToggle /><button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-700" onClick={() => setOpen((value) => !value)} aria-label="Toggle navigation"><Icon name={open ? "close" : "menu"} /></button></div></div>
    <aside className={`${open ? "flex" : "hidden"} w-full shrink-0 flex-col overflow-y-auto bg-[#172238] text-slate-300 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[276px] lg:overflow-hidden no-print`}>
      <Link href="/dashboard" className="portal-sidebar-brand hidden items-center gap-3 border-b border-white/[0.08] px-6 py-6 lg:flex"><span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-950/30">O</span><span><span className="block text-sm font-semibold tracking-wide text-white">Oshitech</span><span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">Education ERP</span></span></Link>
      <div className="px-4 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Your workspace</div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-5" aria-label="Workspace navigation">
        <Link href={navigation.dashboard.href} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${active(navigation.dashboard.href) ? "bg-indigo-500/20 text-white shadow-sm ring-1 ring-inset ring-indigo-400/20" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"}`}><span className={`grid h-8 w-8 place-items-center rounded-lg ${active(navigation.dashboard.href) ? "bg-indigo-500 text-white shadow-lg shadow-indigo-950/20" : "bg-white/[0.06] text-slate-400 group-hover:text-white"}`}><Icon name="home" size={15} /></span><span className="flex-1">Dashboard</span>{active(navigation.dashboard.href) && <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />}</Link>
        {navigation.groups.filter((group) => group.items.length > 0).map((group) => {
          const groupActive = group.items.some((item) => active(item.href));
          const expanded = openGroups[group.label] ?? groupActive;
          return <section key={group.label} className="sidebar-nav-group">
            <button type="button" aria-expanded={expanded} onClick={() => setOpenGroups(Object.fromEntries(navigation.groups.map((item) => [item.label, item.label === group.label ? !expanded : false])))} className={`sidebar-nav-group__toggle group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition ${groupActive ? "sidebar-nav-group__toggle--active bg-white/[0.05] text-white" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"}`}><span className={`grid h-8 w-8 place-items-center rounded-lg ${groupActive ? "bg-indigo-500/20 text-indigo-200" : "bg-white/[0.06] text-slate-400 group-hover:text-white"}`}><Icon name={group.icon} size={15} /></span><span className="flex-1">{group.label}</span></button>
            {expanded && <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-2">{group.items.map((item) => <Link key={item.href} href={item.href} className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium transition ${active(item.href) ? "bg-indigo-500/20 text-white shadow-sm ring-1 ring-inset ring-indigo-400/20" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${active(item.href) ? "bg-indigo-500 text-white" : "bg-white/[0.05] text-slate-400 group-hover:text-white"}`}><Icon name={NAV_ICONS[item.label] ?? "layers"} size={14} /></span><span className="flex-1">{item.label}</span>{active(item.href) && <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />}</Link>)}</div>}
          </section>;
        })}
      </nav>
      <InstallAppCard variant="sidebar" />
      <div ref={accountRef} className="relative mx-3 mb-4 mt-auto shrink-0">
        {accountOpen && (
          <div role="menu" className="portal-sidebar-account-menu absolute bottom-full left-0 right-0 z-10 mb-2 rounded-2xl border border-white/[0.08] bg-[#1e2a44] p-1.5 shadow-xl shadow-black/30">
            <Link href="/support" role="menuitem" className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"><Icon name="ticket" size={14} />Report a problem</Link>
          </div>
        )}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((value) => !value)}
          className="portal-sidebar-account flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5 text-left transition hover:bg-white/[0.07]"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-amber-200 to-orange-300 text-sm font-bold text-orange-900">{user.profile_photo ? <img src={user.profile_photo} alt="" className="h-full w-full object-cover" /> : (user.first_name || user.email).slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-white">{user.first_name ? `${user.first_name} ${user.last_name || ""}` : user.email}</span>
            <span className="mt-1 block truncate text-[10px] text-slate-400">{ROLE_LABEL[user.role]}</span>
          </span>
          <Icon name="chevronDown" size={15} className={`shrink-0 text-slate-500 transition-transform ${accountOpen ? "" : "rotate-180"}`} />
        </button>
      </div>
    </aside>
    <main className="min-w-0 flex-1"><header className="relative z-[70] no-print hidden h-[70px] items-center justify-between border-b border-slate-200/80 bg-white/80 px-8 backdrop-blur lg:flex"><div><div className="text-xs text-slate-400">Oshitech ERP <span className="px-1.5">/</span> {ROLE_LABEL[user.role]}</div><div className="mt-0.5 text-sm font-semibold text-slate-800">{current?.label ?? "Dashboard"}</div></div><div className="flex items-center gap-3">{isAdmin && canUseSchoolAdminTools && <AdminNotifications />}<span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-xs font-medium text-slate-500">Workspace active</span><span className="mx-1 h-6 w-px bg-slate-200" /><span className="max-w-[220px] truncate text-xs text-slate-500">{user.email}</span><ThemeToggle /><button type="button" onClick={signOut} className="portal-header-logout flex min-h-10 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100"><Icon name="logout" size={14} />Logout</button></div></header><div className="p-4 sm:p-6 lg:p-8">{user.role !== "super_admin" && user.role !== "stre_admin" && !user.school && pathname !== "/dashboard" && pathname !== "/profile" && pathname !== "/password-reset" && <section role="status" className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"><h1 className="text-lg font-semibold">School access is not set up yet</h1><p className="mt-2 text-sm leading-6">This account is not linked to a school, so school records are unavailable. {user.role === "school_admin" ? "Create your school's official profile to finish setting up access." : "Ask your School Admin to link this account to the correct school."}</p>{user.role === "school_admin" && <Link href="/manage/schools" className="btn-primary mt-4">Set up school profile</Link>}</section>}{(user.role === "super_admin" || user.role === "stre_admin" || user.school || pathname === "/dashboard" || pathname === "/profile" || pathname === "/password-reset" || (user.role === "school_admin" && pathname === "/manage/schools")) && children}</div></main>
  </div></>;
}
