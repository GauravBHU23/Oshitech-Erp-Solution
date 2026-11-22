"use client";
import Link from "next/link";
import { shortDate, usePublicNotices } from "@/lib/publicNotices";
import Icon from "@/components/Icon";
import PdfLink from "@/components/PdfLink";

const TONE: Record<string, string> = { stre: "status-pill--amber", holiday: "status-pill--green", exam: "status-pill--amber", event: "status-pill--indigo", circular: "status-pill--slate", notice: "status-pill--indigo" };

/** Home page Notice Board: har minute apne aap update hota hai. */
export default function PublicNoticeBoard() {
  const data = usePublicNotices();
  // School ke public notices + STRE exam cell ke notices (dono me PDF ho sakti hai)
  const notices = [
    ...(data?.stre_notices ?? []).map((n) => ({ ...n, category: "stre", school: "STRE exam cell", event_date: null, end_date: null })),
    ...(data?.notices ?? []),
  ];
  return (
    <section id="notices" className="scroll-mt-28 px-4 py-10 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-indigo-600">Notice board</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Latest updates</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Updates automatically</span>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
          <ul className="notice-board-list divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {!data && <li className="p-5 text-sm text-slate-400">Loading notices…</li>}
            {data && notices.length === 0 && <li className="p-6 text-center text-sm text-slate-500">No public notices right now. Schools post holidays, events and circulars here.</li>}
            {notices.map((n) => (
              <li key={n.id} className="flex gap-3 p-4 sm:p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon name={n.category === "holiday" ? "calendar" : "megaphone"} size={17} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm font-semibold text-slate-900">{n.is_pinned ? "📌 " : ""}{n.title}</b>
                    <span className={`status-pill ${TONE[n.category] ?? "status-pill--slate"}`}>{n.category === "stre" ? "STRE" : n.category.replace(/^./, (c) => c.toUpperCase())}</span>
                  </div>
                  {n.body && <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{n.body}</p>}
                  <PdfLink href={n.attachment_url} />
                  <p className="mt-1 text-xs text-slate-400">{n.school}{n.event_date ? ` · On ${shortDate(n.event_date)}${n.end_date && n.end_date !== n.event_date ? ` – ${shortDate(n.end_date)}` : ""}` : ""} · Posted {shortDate(n.publish_on)}</p>
                </div>
              </li>
            ))}
          </ul>
          <aside className="space-y-4">
            <Link href="/stre" className="stre-promo block rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-5 transition hover:border-violet-300">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-600 text-white"><Icon name="award" size={20} /></span>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[.16em] text-violet-700">Upcoming exam</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{data?.stre?.title ?? "STRE — Student Talent Recognition Exam"}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{data?.stre ? `Exam on ${shortDate(data.stre.exam_date)} · Last date ${shortDate(data.stre.last_date)}${Number(data.stre.fee) > 0 ? ` · Fee ₹${Number(data.stre.fee).toLocaleString("en-IN")}` : " · Free"}` : "Registration opens soon. Check status or download your admit card anytime."}</p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700">{data?.stre ? "Register now" : "Check status"}<Icon name="arrow" size={15} /></span>
            </Link>
            <Link href="/register/student" className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon name="userPlus" size={20} /></span>
              <p className="mt-3 text-base font-semibold text-slate-900">Student registration</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">New to a school on Oshitech? Apply with your school code; the school approves it.</p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700">Register<Icon name="arrow" size={15} /></span>
            </Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
