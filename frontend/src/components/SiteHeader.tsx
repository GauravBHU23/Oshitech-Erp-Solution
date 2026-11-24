"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import Icon from "@/components/Icon";
import ThemeToggle from "@/components/ThemeToggle";

/** <details> ko bahar click / Escape par band kare; dusra khule to ise band kare. */
function useDismissibleDetails() {
  const refs = useRef<(HTMLDetailsElement | null)[]>([]);
  const set = (index: number) => (el: HTMLDetailsElement | null) => { refs.current[index] = el; };

  useEffect(() => {
    const closeOthers = (opened: HTMLDetailsElement) => {
      for (const el of refs.current) if (el && el !== opened && el.open) el.removeAttribute("open");
    };
    const onToggle = (event: Event) => {
      const el = event.target as HTMLDetailsElement;
      if (el.open) closeOthers(el);
    };
    const onPointerDown = (event: PointerEvent) => {
      for (const el of refs.current) {
        if (el?.open && !el.contains(event.target as Node)) el.removeAttribute("open");
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      for (const el of refs.current) if (el?.open) el.removeAttribute("open");
    };
    for (const el of refs.current) el?.addEventListener("toggle", onToggle);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      for (const el of refs.current) el?.removeEventListener("toggle", onToggle);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return set;
}

const sections = [
  ["#overview", "Overview"],
  ["#about", "About Us"],
  ["#platform", "Modules"],
  ["#portals", "Portals"],
  ["#teachers", "Teachers"],
  ["#notices", "Notices"],
  ["#workflow", "How it works"],
  ["#security", "Security"],
] as const;

// Desktop navbar par kam links (laptop par ek line me fit ho)
const desktopSections = new Set(["#about", "#notices", "#platform", "#portals", "#teachers"]);

const registrations = [
  { title: "Student Registration", text: "Apply to your school with the school code", href: "/register/student", icon: "student", tone: "bg-emerald-50 text-emerald-700" },
  { title: "Teacher Registration", text: "Join your school as a teacher", href: "/register/teacher", icon: "teacher", tone: "bg-sky-50 text-sky-700" },
  { title: "STRE Registration", text: "Student Talent Recognition Exam", href: "/stre", icon: "award", tone: "bg-violet-50 text-violet-700" },
  { title: "Check status", text: "Registration status", href: "/stre/status", icon: "ticket", tone: "bg-rose-50 text-rose-700" },
];

const loginPortals = [
  { title: "School Admin Portal", href: "/login/school-admin", icon: "settings", tone: "bg-indigo-50 text-indigo-700" },
  { title: "Teacher Admin Portal", href: "/login/teacher", icon: "teacher", tone: "bg-sky-50 text-sky-700" },
  { title: "Student Login Portal", href: "/login/student", icon: "student", tone: "bg-emerald-50 text-emerald-700" },
  { title: "Exam Controller Admin Portal", href: "/login/exam-controller", icon: "ticket", tone: "bg-amber-50 text-amber-700" },
  { title: "Upcoming Exam Admin Portal", href: "/login/stre-admin", icon: "award", tone: "bg-rose-50 text-rose-700" },
  { title: "Super Admin Portal", href: "/login/super-admin", icon: "shield", tone: "bg-violet-50 text-violet-700" },
];

export default function SiteHeader() {
  const { user } = useAuth();
  const pathname = usePathname();
  const onHome = pathname === "/";
  const [open, setOpen] = useState(false);
  const href = (hash: string) => (onHome ? hash : `/${hash}`);
  const setDetailsRef = useDismissibleDetails();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <header className="site-header sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-sm shadow-slate-900/[0.02] backdrop-blur-xl">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-2 px-4 sm:h-[68px] sm:px-8">
        <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#20274a] text-lg font-bold text-white shadow-md shadow-indigo-200">O</span>
          <span><span className="block text-[15px] font-bold tracking-tight text-slate-900">Oshitech</span><span className="-mt-0.5 block text-[9px] font-medium uppercase tracking-[.18em] text-slate-400">Education ERP</span></span>
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center justify-center gap-1 lg:flex">
          {sections.filter(([hash]) => desktopSections.has(hash)).map(([hash, label]) => <a key={hash} className="rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700" href={href(hash)}>{label}</a>)}
          <details ref={setDetailsRef(0)} className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700 [&::-webkit-details-marker]:hidden">Register<Icon name="arrow" className="rotate-90 transition-transform group-open:-rotate-90" size={12} /></summary>
            <div className="site-header__menu absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/15">
              {registrations.map((item) => <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${item.tone}`}><Icon name={item.icon} size={16} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800">{item.title}</span>{item.text && <span className="block text-[11px] text-slate-500">{item.text}</span>}</span></Link>)}
            </div>
          </details>
          <Link href="/contact" className={`rounded-lg px-3 py-2 text-[13px] font-medium transition hover:bg-indigo-50 hover:text-indigo-700 ${pathname === "/contact" ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}>Contact us</Link>
        </nav>
        <div className="flex shrink-0 items-center justify-self-end gap-2">
          <ThemeToggle />
          {user ? (
            <Link className="hidden min-h-10 items-center gap-2 rounded-xl bg-[#20274a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 sm:inline-flex" href="/dashboard">Open dashboard<Icon name="external" size={15} /></Link>
          ) : (
            <details ref={setDetailsRef(1)} className="group relative hidden shrink-0 sm:block">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl bg-[#20274a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 [&::-webkit-details-marker]:hidden"><Icon name="key" size={15} />Portal login<span className="ml-0.5 grid h-5 w-5 place-items-center rounded-full bg-white/15"><Icon name="arrow" className="rotate-90 transition-transform group-open:-rotate-90" size={12} /></span></summary>
              <div className="site-header__menu absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/15">
                {loginPortals.map((portal) => <Link key={portal.href} href={portal.href} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-indigo-700"><span className={`grid h-8 w-8 place-items-center rounded-lg ${portal.tone}`}><Icon name={portal.icon} size={16} /></span><span className="flex-1">{portal.title}</span><Icon name="arrow" className="text-slate-400" size={14} /></Link>)}
              </div>
            </details>
          )}
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-mobile-menu"
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </div>

      {open && (
        <div id="site-mobile-menu" className="site-mobile-menu max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-slate-100 bg-white px-4 pb-6 pt-3 lg:hidden">
          <nav aria-label="Mobile navigation" className="grid grid-cols-2 gap-2">
            {sections.map(([hash, label]) => (
              <a key={hash} href={href(hash)} onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-xl border border-slate-100 bg-slate-50 px-3 text-sm font-medium text-slate-700">{label}</a>
            ))}
            <Link href="/contact" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 text-sm font-semibold text-indigo-700"><Icon name="ticket" size={16} />Contact us</Link>
          </nav>
          <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Registration</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {registrations.map((item) => (
              <Link key={item.href} href={item.href} className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.tone}`}><Icon name={item.icon} size={16} /></span><span className="flex-1"><span className="block">{item.title}</span>{item.text && <span className="block text-[11px] font-normal text-slate-500">{item.text}</span>}</span><Icon name="arrow" className="text-slate-400" size={14} /></Link>
            ))}
          </div>
          <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">{user ? "Your workspace" : "Portal login"}</p>
          {user ? (
            <Link href="/dashboard" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#20274a] px-4 text-sm font-semibold text-white">Open dashboard<Icon name="external" size={15} /></Link>
          ) : (
            <div className="grid gap-1.5">
              {loginPortals.map((portal) => (
                <Link key={portal.href} href={portal.href} className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><span className={`grid h-8 w-8 place-items-center rounded-lg ${portal.tone}`}><Icon name={portal.icon} size={16} /></span><span className="flex-1">{portal.title}</span><Icon name="arrow" className="text-slate-400" size={14} /></Link>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
