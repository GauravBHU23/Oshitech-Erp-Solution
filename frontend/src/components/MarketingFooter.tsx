import Link from "next/link";
import Icon from "@/components/Icon";
import VisitorCount from "@/components/VisitorCount";
import { InstallAppCard } from "@/components/PwaInstall";

const siteUpdatedAt = new Date(process.env.NEXT_PUBLIC_SITE_BUILD_DATE ?? Date.now());
const siteUpdatedLabel = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(siteUpdatedAt);

export default function MarketingFooter() {
  return <footer className="relative isolate overflow-hidden bg-[#10192c] text-white">
    <div className="absolute -right-32 -top-44 -z-10 h-[420px] w-[420px] rounded-full bg-indigo-600/20 blur-[100px]" />
    <div className="absolute -bottom-60 left-[12%] -z-10 h-[400px] w-[400px] rounded-full bg-cyan-600/10 blur-[100px]" />
    <div className="mx-auto max-w-7xl px-5 pb-5 pt-10 sm:px-8 sm:pt-12">
      <div className="grid gap-8 border-b border-white/10 pb-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.1fr_1fr] lg:items-start">
        <div className="max-w-sm">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-lg font-bold shadow-lg shadow-indigo-950/30">O</span>
            <span><span className="block text-sm font-semibold tracking-wide">Oshitech</span><span className="mt-0.5 block text-[9px] uppercase tracking-[.2em] text-slate-500">Education ERP</span></span>
          </Link>
          <p className="mt-4 text-xs leading-6 text-slate-400">One connected workspace for school academics, teachers, students and examinations.</p>
          <div className="mt-4 flex max-w-sm items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
            <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-cyan-200" />
            <p className="text-[11px] leading-5 text-slate-400">Student and teacher registrations need school approval. For admin or exam-controller access, contact your school office.</p>
          </div>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[.15em] text-white">Explore</h2>
          <ul className="mt-4 space-y-3">
            <li><a href="/#platform" className="text-xs text-slate-400 transition hover:text-white">Academic modules</a></li>
            <li><a href="/#portals" className="text-xs text-slate-400 transition hover:text-white">Portals</a></li>
            <li><a href="/#teachers" className="text-xs text-slate-400 transition hover:text-white">Teacher directory</a></li>
            <li><a href="/#notices" className="text-xs text-slate-400 transition hover:text-white">Notice board</a></li>
            <li><a href="/#workflow" className="text-xs text-slate-400 transition hover:text-white">How it works</a></li>
            <li><a href="/#security" className="text-xs text-slate-400 transition hover:text-white">Security</a></li>
            <li><Link href="/contact" className="text-xs text-slate-400 transition hover:text-white">Contact us</Link></li>
            <li><Link href="/support" className="text-xs text-slate-400 transition hover:text-white">Report a problem</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[.15em] text-white">Portal sign in</h2>
          <ul className="mt-4 space-y-3">
            <li><Link href="/login/student" className="text-xs text-slate-400 transition hover:text-white">Student Login Portal</Link></li>
            <li><Link href="/login/teacher" className="text-xs text-slate-400 transition hover:text-white">Teacher Admin Portal</Link></li>
            <li><Link href="/login/school-admin" className="text-xs text-slate-400 transition hover:text-white">School Admin Portal</Link></li>
            <li><Link href="/login/super-admin" className="text-xs text-slate-400 transition hover:text-white">Super Admin Portal</Link></li>
            <li><Link href="/login/exam-controller" className="text-xs text-slate-400 transition hover:text-white">Exam Controller Admin Portal</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[.15em] text-white">Registration & exams</h2>
          <ul className="mt-4 space-y-3">
            <li><Link href="/register/student" className="text-xs text-slate-400 transition hover:text-white">Student Registration</Link></li>
            <li><Link href="/register/teacher" className="text-xs text-slate-400 transition hover:text-white">Teacher Registration</Link></li>
            <li><Link href="/stre" className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 transition hover:text-white">STRE Registration <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] uppercase">Exam</span></Link></li>
            <li><Link href="/stre/status" className="text-xs text-slate-400 transition hover:text-white">STRE Status / Admit Card</Link></li>
          </ul>
        </div>
        <div className="space-y-4 sm:col-span-2 lg:col-span-1"><InstallAppCard /><VisitorCount /></div>
      </div>
      <div className="flex flex-col gap-2 pt-5 text-[10px] text-slate-500 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Oshitech Education ERP. All rights reserved.</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1"><Link href="/terms" className="transition hover:text-white">Terms &amp; Conditions</Link><span aria-hidden="true">·</span><Link href="/privacy" className="transition hover:text-white">Privacy Policy</Link><span aria-hidden="true">·</span><span>Updated {siteUpdatedLabel}</span></p>
        <p className="footer-credit inline-flex items-center gap-1.5 text-slate-400">Designed &amp; developed by <span className="bg-gradient-to-r from-indigo-300 via-sky-200 to-cyan-200 bg-clip-text font-semibold text-transparent">Gaurav Kumar</span></p>
      </div>
    </div>
  </footer>;
}
