"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Paginated, Row } from "@/lib/types";
import Icon from "@/components/Icon";
import PdfLink from "@/components/PdfLink";

const TONE: Record<string, string> = { holiday: "status-pill--green", exam: "status-pill--amber", event: "status-pill--indigo", circular: "status-pill--slate", notice: "status-pill--indigo" };

export default function NoticeWidget() {
  const [notices, setNotices] = useState<Row[] | null>(null);
  useEffect(() => {
    api<Paginated<Row>>("/notices/?page_size=5").then((d) => setNotices(d.results)).catch(() => setNotices([]));
  }, []);
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Notice board</p><h2 className="mt-1 text-lg font-semibold text-slate-900">Latest notices & holidays</h2></div>
        <Link href="/manage/notices" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">View all</Link>
      </div>
      {notices === null && <p className="text-sm text-slate-400">Loading…</p>}
      {notices?.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No notices right now.</p>}
      <ul className="divide-y divide-slate-100">
        {notices?.map((n) => (
          <li key={n.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon name={n.category === "holiday" ? "calendar" : "megaphone"} size={16} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><b className="text-sm font-semibold text-slate-800">{n.is_pinned ? "📌 " : ""}{n.title}</b><span className={`status-pill ${TONE[n.category] ?? "status-pill--slate"}`}>{String(n.category).replace(/^./, (c: string) => c.toUpperCase())}</span></div>
              {n.body && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{n.body}</p>}
              <PdfLink href={n.attachment_url} />
              <p className="mt-1 text-[11px] text-slate-400">{n.event_date ? `On ${n.event_date}${n.end_date && n.end_date !== n.event_date ? ` – ${n.end_date}` : ""} · ` : ""}Posted {n.publish_on}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
