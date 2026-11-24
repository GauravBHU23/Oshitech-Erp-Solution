"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { Paginated, Row } from "@/lib/types";
import Icon from "@/components/Icon";
import Modal from "@/components/Modal";
import Spinner from "@/components/Spinner";

type Summary = { queued: number; sent: number; failed: number; total: number };

/** STRE admin: ek click me sabko mail, progress, aur fail mails ka resend. */
export default function StreEmailCenter({ exam, paidCount, onChanged }: { exam: string; paidCount: number; onChanged: () => void }) {
  const [batch, setBatch] = useState("");
  const [progress, setProgress] = useState<Summary | null>(null);
  const [failed, setFailed] = useState<Row[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [showFailed, setShowFailed] = useState(false);
  const [compose, setCompose] = useState(false);
  const [form, setForm] = useState({ audience: "all", subject: "", message: "" });
  const [busy, setBusy] = useState("");

  const loadFailed = useCallback(async () => {
    if (!exam) return;
    try {
      const d = await api<Paginated<Row>>(`/stre/admin/email-logs/?status=failed&registration__exam=${exam}&page_size=50`);
      setFailed(d.results);
      setFailedCount(d.count);
    } catch { /* ignore */ }
  }, [exam]);

  useEffect(() => { loadFailed(); }, [loadFailed]);

  // Chal rahi bulk mail ka progress
  useEffect(() => {
    if (!batch) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await api<Summary>(`/stre/admin/email-logs/summary/?batch=${batch}`);
        if (stop) return;
        setProgress(s);
        if (s.queued > 0) { window.setTimeout(tick, 2000); return; }
        toast[s.failed ? "error" : "success"](s.failed ? `${s.sent} emails sent, ${s.failed} failed — see “Failed emails”.` : `All ${s.sent} emails sent.`);
        loadFailed();
        onChanged();
      } catch { /* ignore */ }
    };
    tick();
    return () => { stop = true; };
  }, [batch, loadFailed, onChanged]);

  const start = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      const res = await api<{ batch: string; queued: number; detail: string }>("/stre/admin/bulk-email/", { method: "POST", body: { exam, ...body } });
      toast.info(res.detail);
      setProgress({ queued: res.queued, sent: 0, failed: 0, total: res.queued });
      setBatch(res.queued ? res.batch : "");
      if (!res.queued) onChanged();
      return true;
    } catch { return false; } finally {
      setBusy("");
    }
  };

  const resend = async (row: Row) => {
    setBusy(row.id);
    try {
      const res = await api<{ detail: string }>(`/stre/admin/email-logs/${row.id}/resend/`, { method: "POST" });
      toast.success(res.detail);
      loadFailed();
      onChanged();
    } catch { /* toast shown */ } finally {
      setBusy("");
    }
  };

  const resendAll = async () => {
    setBusy("all");
    try {
      const res = await api<{ queued: number; detail: string }>("/stre/admin/email-logs/resend-failed/", { method: "POST", body: { exam } });
      toast.info(res.detail);
      window.setTimeout(loadFailed, 4000);
    } catch { /* toast */ } finally {
      setBusy("");
    }
  };

  const running = !!progress && progress.queued > 0;
  const pct = progress && progress.total ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0;

  return (
    <section className="stre-email-center rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon name="bell" /></span>
          <div><h2 className="text-sm font-semibold text-slate-900">Email center</h2><p className="text-xs text-slate-500">Send to everyone in one click. Failed emails can be resent.</p></div>
        </div>
        <button className="btn-primary" disabled={!exam || !!busy || running} onClick={() => { if (window.confirm(`Issue admit cards for ${paidCount} paid candidate(s) and email admit cards to everyone who has one?`)) start({ kind: "admit_card", issue: true }, "admit"); }}>
          {busy === "admit" ? <><Spinner className="mr-2" />Starting…</> : <><Icon name="ticket" size={15} className="mr-2" />Send admit cards to all</>}
        </button>
        <button className="btn-ghost" disabled={!exam || !!busy || running} onClick={() => setCompose(true)}><Icon name="megaphone" size={15} className="mr-2" />Email everyone</button>
        <button className={`btn-ghost ${failedCount ? "!border-red-200 !text-red-700" : ""}`} disabled={!exam} onClick={() => setShowFailed((v) => !v)}>Failed emails ({failedCount})</button>
      </div>

      {progress && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-600"><span>{running ? "Sending…" : "Last batch"}</span><span>{progress.sent} sent · {progress.failed} failed · {progress.total} total</span></div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      {showFailed && (
        <div className="mt-4 rounded-xl border border-red-100">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 bg-red-50/60 px-3 py-2">
            <b className="text-xs text-red-800">Failed emails</b>
            <button className="resource-action-btn resource-action-btn--primary" disabled={!failedCount || !!busy} onClick={resendAll}>{busy === "all" ? <Spinner /> : "Resend all failed"}</button>
          </div>
          {failed.length === 0 ? <p className="p-4 text-center text-xs text-slate-500">No failed emails. 🎉</p> : (
            <ul className="divide-y divide-slate-100">
              {failed.map((row) => (
                <li key={row.id} className="flex flex-wrap items-start gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{row.candidate} <span className="font-mono text-xs text-slate-400">{row.registration_no}</span></p>
                    <p className="break-all text-xs text-slate-500">{row.to_email} · {row.kind_label} · tried {row.attempts}×</p>
                    <p className="mt-0.5 break-words text-xs text-red-600">{row.error || "Unknown error"}</p>
                  </div>
                  <button className="resource-action-btn" disabled={!!busy} onClick={() => resend(row)}>{busy === row.id ? <Spinner /> : "Resend"}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {compose && (
        <Modal title="Email everyone" onClose={() => setCompose(false)}>
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await start({ kind: "announcement", ...form }, "announce")) { setCompose(false); setForm({ audience: "all", subject: "", message: "" }); } }}>
            <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600">Send to<span className="text-red-500"> *</span></span>
              <select className="input" value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
                <option value="all">Everyone registered (except cancelled)</option>
                <option value="payment_pending">Payment pending</option>
                <option value="paid">Paid (admit card not issued)</option>
                <option value="admit_card_issued">Admit card issued</option>
              </select>
            </label>
            <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600">Subject<span className="text-red-500"> *</span></span>
              <input className="input" required minLength={3} maxLength={200} placeholder="e.g. Exam centre update" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            </label>
            <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600">Message<span className="text-red-500"> *</span></span>
              <textarea className="input" required minLength={5} maxLength={5000} rows={6} placeholder={"First line appears as the main message.\nEach new line appears as a point."} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
            </label>
            <p className="text-xs text-slate-500">Each candidate gets a personal email with their registration number and status link.</p>
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setCompose(false)}>Cancel</button><button className="btn-primary" disabled={busy === "announce"}>{busy === "announce" ? <><Spinner className="mr-2" />Sending…</> : "Send to all"}</button></div>
          </form>
        </Modal>
      )}
    </section>
  );
}
