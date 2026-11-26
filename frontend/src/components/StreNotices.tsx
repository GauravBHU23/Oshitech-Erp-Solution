"use client";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/stre";
import Icon from "@/components/Icon";
import PdfLink from "@/components/PdfLink";
import NoticeNewBadge from "@/components/NoticeNewBadge";

type Notice = { id: string; title: string; body: string; is_pinned: boolean; publish_on: string; attachment_url?: string | null };

/** STRE notices (exam cell ke updates) — registration aur status page par; har minute refresh. */
export default function StreNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    const load = () => fetch("/api/v1/stre/notices/", { headers: { "ngrok-skip-browser-warning": "true" } }).then((r) => (r.ok ? r.json() : [])).then(setNotices).catch(() => {});
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, []);
  if (!notices.length) return null;
  return (
    <section className="stre-notices mb-4 overflow-hidden rounded-[22px] border border-indigo-200 bg-white shadow-sm" aria-label="STRE notices">
      <div className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-900"><Icon name="megaphone" size={16} />Notices from the exam cell</div>
      <ul className="divide-y divide-slate-100">
        {notices.map((n) => (
          <li key={n.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2"><NoticeNewBadge publishOn={n.publish_on} /><p className="text-sm font-semibold text-slate-900">{n.is_pinned ? "📌 " : ""}{n.title}</p></div>
            {n.body && <p className="mt-0.5 whitespace-pre-line text-sm leading-6 text-slate-600">{n.body}</p>}
            <PdfLink href={n.attachment_url} />
            <p className="mt-0.5 text-[11px] text-slate-400">{formatDate(n.publish_on)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
