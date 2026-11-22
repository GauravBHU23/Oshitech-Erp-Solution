"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/stre";
import { toast } from "@/lib/toast";
import type { Paginated, Row } from "@/lib/types";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

const TONE: Record<string, string> = { open: "status-pill--red", in_progress: "status-pill--amber", resolved: "status-pill--green" };

function Ticket({ t, onSaved }: { t: Row; onSaved: () => void }) {
  const [open, setOpen] = useState(t.status !== "resolved");
  const [status, setStatus] = useState(t.status as string);
  const [reply, setReply] = useState((t.admin_reply as string) || "");
  const [busy, setBusy] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status === "resolved" && reply.trim().length < 3) { toast.error("Write a reply before marking it resolved — the candidate gets it by email."); return; }
    setBusy(true);
    try {
      await api(`/stre/admin/support/${t.id}/`, { method: "PATCH", body: { status, admin_reply: reply.trim() } });
      toast.success(reply.trim() && reply.trim() !== t.admin_reply ? `Saved. Reply emailed to ${t.email}.` : "Ticket updated.");
      onSaved();
    } catch { /* toast shown */ } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <button type="button" className="flex w-full flex-wrap items-start gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{t.subject}</p>
          <p className="mt-0.5 break-all text-xs text-slate-500"><span className="font-mono">{t.ticket_no}</span> · {t.name} · {t.mobile} · {t.email}</p>
        </div>
        <span className="status-pill status-pill--indigo">{t.category_label}</span>
        <span className={`status-pill ${TONE[t.status] ?? "status-pill--slate"}`}>{t.status_label}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <p className="whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">{t.message}</p>
          <p className="text-xs text-slate-500">
            Received {formatDate(t.created_at)}
            {t.registration_no ? ` · Registration no. ${t.registration_no}` : ""}
            {t.linked_candidate ? ` · Matched to ${t.linked_candidate}` : t.registration_no ? " · (not matched — check number/mobile)" : ""}
          </p>
          {t.registration_no && <p className="text-xs text-slate-500">To fix the details: open <b>STRE Registrations</b>, search <span className="font-mono">{t.registration_no}</span> and click <b>Edit</b>.</p>}
          <form onSubmit={save} className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">Reply to candidate (sent by email)
              <textarea className="input mt-1" rows={3} maxLength={3000} placeholder="e.g. Your father's name has been corrected. Please check your status page." value={reply} onChange={(e) => setReply(e.target.value)} />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input !w-auto" aria-label="Ticket status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
              </select>
              <button className="btn-primary" disabled={busy}>{busy ? <><Spinner className="mr-2" />Saving…</> : "Save & send reply"}</button>
              {t.replied_at && <span className="text-xs text-slate-400">Last reply {formatDate(t.replied_at)}</span>}
            </div>
          </form>
        </div>
      )}
    </li>
  );
}

export default function StreSupportPage() {
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Paginated<Row> | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page_size: "50" });
    if (status) qs.set("status", status);
    if (query) qs.set("search", query);
    try {
      const [list, c] = await Promise.all([api<Paginated<Row>>(`/stre/admin/support/?${qs}`), api<Record<string, number>>("/stre/admin/support/counts/")]);
      setData(list);
      setCounts(c);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load support requests.");
      setData({ count: 0, next: null, previous: null, results: [] });
    }
  }, [status, query]);

  useEffect(() => { setData(null); load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="portal-admin-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Upcoming exam · STRE</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">STRE Support Requests</h1>
        <p className="mt-1.5 text-sm text-slate-500">Problems raised by candidates. Fix the issue, write a reply and mark it resolved — the reply is emailed to the candidate.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {[["open", "Open"], ["in_progress", "In progress"], ["resolved", "Resolved"], ["", "All"]].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${status === value ? "border-indigo-400 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200"}`}>
            {label}{value && <span className="ml-1.5 rounded-full bg-white px-1.5 text-xs">{counts[value] ?? 0}</span>}
          </button>
        ))}
        <form className="ml-auto flex w-full gap-2 sm:w-auto" onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}>
          <input className="input sm:!w-64" type="search" placeholder="Ticket, name, mobile, reg. no" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn-ghost">Search</button>
        </form>
      </div>
      {!data && <p className="text-sm text-slate-500"><Spinner className="mr-2" />Loading…</p>}
      {data?.results.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500"><Icon name="check" className="mx-auto mb-2 text-emerald-600" />No requests here.</p>}
      <ul className="space-y-3">{data?.results.map((t) => <Ticket key={`${t.id}-${t.updated_at}`} t={t} onSaved={load} />)}</ul>
    </div>
  );
}
