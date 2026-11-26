"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { shortDate, usePublicNotices } from "@/lib/publicNotices";
import Icon from "@/components/Icon";
import PdfLink from "@/components/PdfLink";
import NoticeNewBadge from "@/components/NoticeNewBadge";

const TONE: Record<string, string> = { stre: "status-pill--amber", holiday: "status-pill--green", exam: "status-pill--amber", event: "status-pill--indigo", circular: "status-pill--slate", notice: "status-pill--indigo" };

/** Home page Notice Board: har minute apne aap update hota hai. */
export default function PublicNoticeBoard() {
  const data = usePublicNotices();
  // School ke public notices + STRE exam cell ke notices (dono me PDF ho sakti hai)
  const notices = [
    ...(data?.stre_notices ?? []).map((n) => ({ ...n, category: "stre", school: "STRE exam cell", event_date: null, end_date: null })),
    ...(data?.notices ?? []),
  ];
  const noticeListRef = useRef<HTMLUListElement>(null);
  const scrollDirection = useRef(1);
  const [pointerPaused, setPointerPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [touchPaused, setTouchPaused] = useState(false);
  const paused = pointerPaused || focusPaused || touchPaused;

  // On touch devices, pointerenter/leave don't fire the way they do with a mouse, so the
  // auto-scroll timer kept fighting the user's own finger-drag every 40ms, making manual
  // scrolling feel broken. Pause on touchstart and keep it paused through momentum
  // scrolling (resume a beat after the last touchend/scroll event settles).
  useEffect(() => {
    const list = noticeListRef.current;
    if (!list) return;
    let resumeTimer: number | undefined;
    const pauseForTouch = () => {
      setTouchPaused(true);
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => setTouchPaused(false), 1500);
    };
    list.addEventListener("touchstart", pauseForTouch, { passive: true });
    list.addEventListener("touchmove", pauseForTouch, { passive: true });
    return () => {
      list.removeEventListener("touchstart", pauseForTouch);
      list.removeEventListener("touchmove", pauseForTouch);
      window.clearTimeout(resumeTimer);
    };
  }, []);

  useEffect(() => {
    const list = noticeListRef.current;
    if (!list || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      const maxScroll = list.scrollHeight - list.clientHeight;
      if (maxScroll <= 0) return;
      if (list.scrollTop >= maxScroll) scrollDirection.current = -1;
      else if (list.scrollTop <= 0) scrollDirection.current = 1;
      list.scrollTop += scrollDirection.current;
    }, 40);

    return () => window.clearInterval(timer);
  }, [notices.length, paused]);

  return (
    <section id="notices" className="scroll-mt-28 px-4 py-10 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-indigo-600">Notice board</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Latest updates</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Auto-scrolls · tap, hover or focus to pause</span>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
          <ul
            ref={noticeListRef}
            aria-label="Public notices"
            aria-live="off"
            onPointerEnter={() => setPointerPaused(true)}
            onPointerLeave={() => setPointerPaused(false)}
            onFocusCapture={() => setFocusPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusPaused(false);
            }}
            className="notice-board-list relative isolate max-h-[320px] divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            {!data && <li className="relative z-10 p-5 text-sm text-slate-400">Loading notices…</li>}
            {data && notices.length === 0 && <li className="relative z-10 p-6 text-center text-sm text-slate-500">No public notices right now. Schools post holidays, events and circulars here.</li>}
            {notices.map((n) => (
              <li key={n.id} className="relative z-10 flex gap-3 p-4 sm:p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon name={n.category === "holiday" ? "calendar" : "megaphone"} size={17} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <NoticeNewBadge publishOn={n.publish_on} />
                    <b className="text-sm font-semibold text-slate-900">{n.is_pinned ? "📌 " : ""}{n.title}</b>
                    <span className={`status-pill ${TONE[n.category] ?? "status-pill--slate"}`}>{n.category === "stre" ? "STRE" : n.category.replace(/^./, (c) => c.toUpperCase())}</span>
                  </div>
                  {n.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{n.body}</p>}
                  <PdfLink href={n.attachment_url} />
                  <p className="mt-1 text-xs text-slate-400">{n.school}{n.event_date ? ` · On ${shortDate(n.event_date)}${n.end_date && n.end_date !== n.event_date ? ` – ${shortDate(n.end_date)}` : ""}` : ""} · Posted {shortDate(n.publish_on)}</p>
                </div>
              </li>
            ))}
          </ul>
          <aside className="space-y-4">
            <Link href="/stre" className="stre-promo relative isolate block overflow-hidden rounded-2xl border border-violet-200 bg-violet-50 p-5 transition hover:border-violet-300">
              <div className="relative z-10">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-600 text-white"><Icon name="award" size={20} /></span>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-[.16em] text-violet-700">Upcoming exam</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{data?.stre?.title ?? "STRE — Student Talent Recognition Exam"}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{data?.stre ? `Exam on ${shortDate(data.stre.exam_date)} (tentative) · Registration closes ${shortDate(data.stre.last_date)}${Number(data.stre.fee) > 0 ? ` · Fee ₹${Number(data.stre.fee).toLocaleString("en-IN")}` : " · Free"}` : "Registration opens soon. Check status or download your admit card anytime."}</p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700">{data?.stre ? "Register now" : "Check status"}<Icon name="arrow" size={15} /></span>
              </div>
            </Link>
            <Link href="/register/student" className="relative isolate block overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm transition hover:border-emerald-300">
              <div className="relative z-10">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon name="userPlus" size={20} /></span>
                <p className="mt-3 text-base font-semibold text-slate-900">Student registration</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">New to a school on Oshitech? Apply with your school code; the school approves it.</p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700">Register<Icon name="arrow" size={15} /></span>
              </div>
            </Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
