"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import Icon from "@/components/Icon";
import { actionLabel, modelLabel } from "@/lib/audit";

type AuditNotice = { id: string; created_at: string; user_email: string; action: string; model: string; object_id: string };
type SupportNotice = { id: string; created_at: string; email: string; category: string; subject: string; status: "open" | "in_progress" | "resolved" };

export default function AdminNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<AuditNotice[]>([]);
  const [supportItems, setSupportItems] = useState<SupportNotice[]>([]);
  const [openSupportCount, setOpenSupportCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [supportError, setSupportError] = useState("");
  const seenAt = useRef("");
  const storageKey = user ? `oshitech-audit-seen:${user.id}` : "";

  const refresh = useCallback(async () => {
    if (user?.role !== "super_admin" && !user?.school) return;
    try {
      const data = await api<Paginated<AuditNotice>>("/audit-logs/?page_size=10");
      setItems(data.results.slice(0, 8));
      if (seenAt.current) setUnread(data.results.filter((item) => Date.parse(item.created_at) > Date.parse(seenAt.current) && item.user_email?.toLowerCase() !== user?.email?.toLowerCase()).length);
    } catch { /* Activity feed is optional; the audit log page remains available. */ }
    try {
      const data = await api<Paginated<SupportNotice> & { open_count: number }>("/support-requests/?page_size=10");
      setSupportItems(data.results.slice(0, 5));
      setOpenSupportCount(data.open_count);
      setSupportError("");
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : "Could not load support notifications.");
    }
  }, [user?.email, user?.role, user?.school]);
  const notificationCount = unread + openSupportCount;

  useEffect(() => {
    if (!storageKey || (user?.role !== "super_admin" && !user?.school)) return;
    seenAt.current = window.localStorage.getItem(storageKey) || new Date().toISOString();
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, [storageKey, refresh, user?.role, user?.school]);

  // Bahar click ya Esc dabane par panel band
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent | TouchEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && storageKey) {
      const now = new Date().toISOString();
      seenAt.current = now;
      window.localStorage.setItem(storageKey, now);
      setUnread(0);
    }
  };

  return <div ref={rootRef} className="relative z-[80]">
    <button type="button" onClick={toggle} aria-label={`Notifications${notificationCount ? `, ${notificationCount} unread or open` : ""}`} aria-expanded={open} className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"><Icon name="bell" size={17} />{notificationCount > 0 && !open && <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white">{notificationCount > 9 ? "9+" : notificationCount}</span>}</button>
    {open && <div className="fixed inset-0 z-[79] bg-slate-900/20 sm:hidden" aria-hidden="true" onClick={() => setOpen(false)} />}
    {open && <div role="dialog" aria-label="Notifications" className="admin-notifications-panel fixed inset-x-3 top-[4.25rem] z-[80] flex max-h-[calc(100dvh-5.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-2xl shadow-slate-900/15 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:max-h-[min(80vh,36rem)] sm:w-96">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-900">Notifications</p><p className="mt-0.5 text-[11px] text-slate-500">Activity and support refresh every 30 seconds</p></div><Link href="/manage/audit-logs" onClick={() => setOpen(false)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">View activity</Link></div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><div className="border-b border-slate-100 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-800">Support requests {openSupportCount > 0 && <span className="ml-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700">{openSupportCount} open</span>}</p><Link href="/manage/support" onClick={() => setOpen(false)} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800">Open inbox</Link></div>
        {supportError ? <p role="alert" className="text-[11px] text-rose-700">{supportError}</p> : supportItems.length ? <ul className="space-y-2">{supportItems.map((item) => <li key={item.id} className="flex items-start gap-2"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.status === "open" ? "bg-rose-500" : item.status === "in_progress" ? "bg-amber-500" : "bg-emerald-500"}`} /><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-800">{item.subject}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">{item.email} · {item.status.replaceAll("_", " ")}</p></div></li>)}</ul> : <p className="text-[11px] text-slate-500">No support requests yet.</p>}
      </div>
      {items.length ? <ul className="divide-y divide-slate-100">{items.map((item) => <li key={item.id} className="flex gap-3 px-4 py-3"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-700"><Icon name="clock" size={15} /></span><div className="min-w-0"><p className="text-xs font-semibold text-slate-800">{actionLabel(item.action)}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{modelLabel(item.model)} · {item.user_email || "System"}</p><time className="mt-1 block text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div></li>)}</ul> : <div className="px-4 py-8 text-center text-sm text-slate-500">No recent activity.</div>}</div>
    </div>}
  </div>;
}
