import Link from "next/link";
import Icon from "@/components/Icon";
import VisitorCount from "@/components/VisitorCount";
import { InstallAppCard } from "@/components/PwaInstall";

const siteUpdatedAt = new Date(process.env.NEXT_PUBLIC_SITE_BUILD_DATE ?? Date.now());
const siteUpdatedLabel = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(siteUpdatedAt);

export default function MarketingFooter() {
  return <footer className="marketing-footer relative isolate overflow-hidden bg-[#f1f5f9] text-slate-800">
    <div className="absolute -right-32 -top-44 -z-10 h-[420px] w-[420px] rounded-full bg-indigo-500/10 blur-[100px]" />
    <div className="absolute -bottom-60 left-[12%] -z-10 h-[400px] w-[400px] rounded-full bg-cyan-400/10 blur-[100px]" />
    <div className="mx-auto max-w-7xl px-5 pb-5 pt-10 sm:px-8 sm:pt-12">
      <div className="marketing-footer__divider grid gap-8 border-b border-slate-200 pb-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.1fr_1fr] lg:items-start">
        <div className="max-w-sm">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-lg font-bold shadow-lg shadow-indigo-950/30">O</span>
            <span><span className="block text-sm font-semibold tracking-wide text-slate-900">Oshitech</span><span className="mt-0.5 block text-[9px] uppercase tracking-[.2em] text-slate-500">Education ERP</span></span>
          </Link>
          <p className="mt-4 text-xs leading-6 text-slate-600">One connected workspace for school academics, teachers, students and examinations.</p>
          <div className="marketing-footer__notice mt-4 flex max-w-sm items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5">
            <Icon name="shield" size={15} className="marketing-footer__notice-icon mt-0.5 shrink-0 text-indigo-600" />
            <p className="text-[11px] leading-5 text-slate-600">Student and teacher registrations need school approval. For admin or exam-controller access, contact your school office.</p>
          </div>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[.15em] text-slate-900">Explore</h2>
          <ul className="mt-4 space-y-3">
            <li><a href="/#platform" className="text-xs text-slate-600 transition hover:text-indigo-700">Academic modules</a></li>
            <li><a href="/#portals" className="text-xs text-slate-600 transition hover:text-indigo-700">Portals</a></li>
            <li><a href="/#teachers" className="text-xs text-slate-600 transition hover:text-indigo-700">Teacher directory</a></li>
            <li><a href="/#notices" className="text-xs text-slate-600 transition hover:text-indigo-700">Notice board</a></li>
            <li><a href="/#workflow" className="text-xs text-slate-600 transition hover:text-indigo-700">How it works</a></li>
            <li><a href="/#security" className="text-xs text-slate-600 transition hover:text-indigo-700">Security</a></li>
            <li><Link href="/contact" className="text-xs text-slate-600 transition hover:text-indigo-700">Contact us</Link></li>
            <li><Link href="/support" className="text-xs text-slate-600 transition hover:text-indigo-700">Report a problem</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[.15em] text-slate-900">Portal sign in</h2>
          <ul className="mt-4 space-y-3">
            <li><Link href="/#notices" className="text-xs text-slate-600 transition hover:text-indigo-700">Upcoming Exams</Link></li>
            <li><Link href="/login/student" className="text-xs text-slate-600 transition hover:text-indigo-700">Student Login Portal</Link></li>
            <li><Link href="/login/teacher" className="text-xs text-slate-600 transition hover:text-indigo-700">Teacher Admin Portal</Link></li>
            <li><Link href="/login/school-admin" className="text-xs text-slate-600 transition hover:text-indigo-700">School Admin Portal</Link></li>
            <li><Link href="/login/super-admin" className="text-xs text-slate-600 transition hover:text-indigo-700">Super Admin Portal</Link></li>
            <li><Link href="/login/exam-controller" className="text-xs text-slate-600 transition hover:text-indigo-700">Exam Controller Admin Portal</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[.15em] text-slate-900">Registration & exams</h2>
          <ul className="mt-4 space-y-3">
            <li><Link href="/register/student" className="text-xs text-slate-600 transition hover:text-indigo-700">Student Registration</Link></li>
            <li><Link href="/register/teacher" className="text-xs text-slate-600 transition hover:text-indigo-700">Teacher Registration</Link></li>
            <li><Link href="/stre" className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 transition hover:text-violet-900">STRE Exam Registration</Link></li>
            <li><Link href="/stre/status" className="text-xs text-slate-600 transition hover:text-indigo-700">Check Status</Link></li>
          </ul>
        </div>
        <div className="space-y-4 sm:col-span-2 lg:col-span-1"><InstallAppCard /><VisitorCount /></div>
      </div>
      <div className="flex flex-col gap-2 pt-5 text-xs text-slate-600 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Oshitech Education ERP. All rights reserved.</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1"><Link href="/terms" className="transition hover:text-indigo-700">Terms &amp; Conditions</Link><span aria-hidden="true">·</span><Link href="/privacy" className="transition hover:text-indigo-700">Privacy Policy</Link><span aria-hidden="true">·</span><span>Last updated: {siteUpdatedLabel}</span></p>
        <p className="footer-credit inline-flex items-center gap-1.5 text-slate-600">Designed &amp; developed by <span className="marketing-footer__credit-name bg-gradient-to-r from-indigo-700 via-sky-700 to-cyan-800 bg-clip-text font-semibold text-transparent">Gaurav Kumar</span></p>
      </div>
    </div>
  </footer>;
}
