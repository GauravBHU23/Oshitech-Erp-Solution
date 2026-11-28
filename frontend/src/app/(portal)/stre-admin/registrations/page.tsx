"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { STRE_STATUS_TONE, formatDate, streClassLabel, streSchoolFieldLabel, streStateLabel } from "@/lib/stre";
import { toast } from "@/lib/toast";
import type { Paginated, Row } from "@/lib/types";
import Icon from "@/components/Icon";
import Modal from "@/components/Modal";
import Spinner from "@/components/Spinner";
import StreEmailCenter from "@/components/StreEmailCenter";
import StreEditRegistration from "@/components/StreEditRegistration";

const STATUSES = [
  ["payment_pending", "Unpaid (not confirmed)"],
  ["payment_submitted", "Payment to verify"],
  ["paid", "Paid"],
  ["admit_card_issued", "Admit card issued"],
  ["cancelled", "Cancelled"],
] as const;

function Detail({ label, value }: { label: string; value: unknown }) {
  const text = value === null || value === undefined || value === "" ? "—" : Array.isArray(value) ? value.join(", ") : String(value);
  return <div className="border-b border-slate-100 py-2"><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-800">{text}</dd></div>;
}

export default function StreRegistrationsPage() {
  const [exams, setExams] = useState<Row[]>([]);
  const [exam, setExam] = useState("");
  const [status, setStatus] = useState("");
  const [paymentIssue, setPaymentIssue] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<Row> | null>(null);
  const [stats, setStats] = useState<Row | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api<Paginated<Row>>("/stre/admin/exams/?page_size=200").then((d) => { setExams(d.results); if (d.results[0]) setExam(d.results[0].id); }).catch(() => {});
  }, []);

  const params = useCallback((extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams(extra);
    if (exam) qs.set("exam", exam);
    if (status) qs.set("status", status);
    if (paymentIssue) qs.set("payment_issue", "failed");
    if (query) qs.set("search", query);
    return qs;
  }, [exam, status, query, paymentIssue]);

  const lastTotal = useRef<number | null>(null);
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setData(null);
    try {
      const [list, st] = await Promise.all([
        api<Paginated<Row>>(`/stre/admin/registrations/?${params({ page: String(page) })}`),
        api<Row>(`/stre/admin/registrations/stats/?${params()}`),
      ]);
      // Background me naye paid registration aaye to batao
      if (quiet && lastTotal.current !== null && typeof st.total === "number" && st.total > lastTotal.current) {
        const n = st.total - lastTotal.current;
        toast.success(`${n} new paid registration${n > 1 ? "s" : ""} — roll numbers assigned.`);
      }
      if (typeof st.total === "number") lastTotal.current = st.total;
      setData(list);
      setStats(st);
    } catch (e) {
      if (quiet) return;
      toast.error(e instanceof ApiError ? e.message : "Could not load registrations.");
      setData({ count: 0, next: null, previous: null, results: [] });
    }
  }, [params, page]);

  useEffect(() => { lastTotal.current = null; void load(); }, [load]);
  // Har minute apne aap refresh (server har 2 minute Cashfree se payments khud confirm karta hai)
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busy && !editing) void load(true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load, busy, editing]);

  const run = async (key: string, fn: () => Promise<string | void>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    try {
      const msg = await fn();
      if (msg) toast.success(msg);
      await load();
    } catch { /* api() shows the error toast */ } finally {
      setBusy("");
    }
  };

  const act = (reg: Row, path: string, body: Record<string, unknown> = {}) =>
    api<Row>(`/stre/admin/registrations/${reg.id}/${path}/`, { method: "POST", body }).then((updated) => { if (selected?.id === reg.id) setSelected(updated); return updated; });

  const exportCsv = async () => {
    setBusy("export");
    try {
      const res = await fetch(`/api/v1/stre/admin/registrations/export/?${params()}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "stre-registrations.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel (CSV) file downloaded.");
    } catch {
      toast.error("Could not export. Try again.");
    } finally {
      setBusy("");
    }
  };

  const rowActions = (r: Row) => (
    <div className="flex flex-wrap justify-end gap-1.5">
      <button className="resource-action-btn" onClick={() => { setEditing(false); setSelected(r); }}>View</button>
      {r.status !== "cancelled" && <button className="resource-action-btn" onClick={() => { setSelected(r); setEditing(true); }}>Edit</button>}
      {r.status === "payment_pending" && r.payment_method === "cashfree" && r.gateway_order_id && (
        <button className="resource-action-btn" disabled={!!busy} onClick={() => run(`check-${r.id}`, async () => { const u = await act(r, "check-payment"); return String(u.message || "Payment confirmed."); })}>{busy === `check-${r.id}` ? <Spinner /> : "Check payment"}</button>
      )}
      {(r.status === "payment_pending" || r.status === "payment_submitted") && (
        <button className="resource-action-btn resource-action-btn--primary" disabled={!!busy} onClick={() => run(`paid-${r.id}`, async () => { const u = await act(r, "mark-paid", { reference: r.payment_reference }); return `Payment verified for ${r.registration_no}. Roll number assigned; admit card is not issued automatically.`; }, `Mark fee as received for ${r.full_name}?${r.payment_reference ? `\nTransaction ID: ${r.payment_reference}` : ""}`)}>Verify payment</button>
      )}
      {r.status === "paid" && (
        <button className="resource-action-btn resource-action-btn--primary" disabled={!!busy} onClick={() => run(`issue-${r.id}`, async () => { const u = await act(r, "issue-admit-card", { send: true }); return u.email_sent ? `Admit card ${u.roll_no} issued and emailed.` : `Admit card ${u.roll_no} issued (email could not be sent).`; })}>Issue admit card</button>
      )}
      {r.status === "admit_card_issued" && (
        <button className="resource-action-btn" disabled={!!busy} onClick={() => run(`send-${r.id}`, async () => (await api<{ detail: string }>(`/stre/admin/registrations/${r.id}/send-admit-card/`, { method: "POST" })).detail)}>{r.admit_card_sent_at ? "Resend" : "Email"} admit card</button>
      )}
    </div>
  );

  const pages = data ? Math.max(1, Math.ceil(data.count / 25)) : 1;
  const by = (stats?.by_status ?? {}) as Record<string, number>;

  return (
    <div className="space-y-5">
      <div className="portal-admin-heading flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Upcoming exam · STRE</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">STRE Registrations</h1>
          <p className="mt-1.5 text-sm text-slate-500">Verify payments, issue admit cards and email them to candidates.</p>
        </div>
        <div className="flex flex-wrap gap-2">
        {stats?.auto_sync && (
          <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800" title="Paid Cashfree payments are confirmed automatically every 2 minutes. This page refreshes itself every minute.">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Auto payment check ON{stats.last_payment_check ? ` · last ${new Date(stats.last_payment_check).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
        )}
        <button className="btn-ghost" disabled={!!busy} onClick={exportCsv}>{busy === "export" ? <Spinner /> : <><Icon name="download" size={15} className="mr-2" />Export Excel</>}</button>
        </div>
      </div>

      <StreEmailCenter exam={exam} paidCount={by.paid ?? 0} onChanged={load} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[["Confirmed", stats?.total ?? "—", ""], ["Unpaid (not confirmed)", by.payment_pending ?? 0, "payment_pending"], ["To verify", by.payment_submitted ?? 0, "payment_submitted"], ["Payment failed", stats?.payment_failed ?? 0, "__failed"], ["Paid", by.paid ?? 0, "paid"], ["Admit cards", by.admit_card_issued ?? 0, "admit_card_issued"], ["Collected", `₹${Number(stats?.collected ?? 0).toLocaleString("en-IN")}`, ""]].map(([label, value, key]) => (
          <button key={String(label)} type="button" disabled={!key} onClick={() => { setPage(1); if (key === "__failed") { setPaymentIssue((v) => !v); setStatus(""); } else { setPaymentIssue(false); setStatus(status === key ? "" : String(key)); } }} className={`rounded-2xl border bg-white p-3 text-left shadow-sm transition ${(key === "__failed" ? paymentIssue : key && status === key) ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200/80"} ${key ? "hover:border-indigo-200" : "cursor-default"}`}>
            <span className="block text-[11px] text-slate-500">{label}</span>
            <span className="mt-1 block text-xl font-semibold text-slate-900">{value}</span>
          </button>
        ))}
      </section>

      <form className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}>
        <label className="text-xs font-medium text-slate-600">Exam
          <select className="input mt-1.5" value={exam} onChange={(e) => { setPage(1); setExam(e.target.value); }}>
            <option value="">All exams</option>
            {exams.map((x) => <option key={x.id} value={x.id}>{x.title} ({x.code})</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Status
          <select className="input mt-1.5" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">All statuses</option>
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Search
          <input className="input mt-1.5" type="search" placeholder="Name, reg. no, roll no, email, mobile, UTR" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button className="btn-primary">Search</button>
      </form>

      {exams.length === 0 && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No exam has been created yet. Go to <b>Exams & Fees</b> to create the exam, set the fee and open registration.</p>}

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm md:block">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <tr><th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Reg. / Roll no.</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {!data && <tr><td colSpan={7} className="px-4 py-6 text-slate-400"><Spinner className="mr-2" />Loading…</td></tr>}
            {data?.results.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No registrations found.</td></tr>}
            {data?.results.map((r) => (
              <tr key={r.id} className="hover:bg-indigo-50/30">
                <td className="px-4 py-3"><b className="block font-medium text-slate-800">{r.full_name}</b><span className="text-xs text-slate-500">S/o {r.father_name}</span></td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs"><span className="block text-slate-800">{r.registration_no}</span><span className="text-indigo-600">{r.roll_no || "—"}</span></td>
                <td className="px-4 py-3 text-xs"><span className="block break-all text-slate-700">{r.email}</span><span className="text-slate-500">{r.mobile}</span></td>
                <td className="px-4 py-3 text-xs text-slate-700">{r.subject}</td>
                <td className="px-4 py-3 text-xs"><span className="block font-semibold text-slate-800">₹{Number(r.amount).toLocaleString("en-IN")}</span><span className="font-mono text-slate-500">{r.payment_reference || r.razorpay_payment_id || r.payment_method || "—"}</span></td>
                <td className="px-4 py-3"><span className={`status-pill status-pill--${STRE_STATUS_TONE[r.status] ?? "slate"}`}>{r.status_label}</span></td>
                <td className="px-4 py-3">{rowActions(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {!data && <li className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-400"><Spinner className="mr-2" />Loading…</li>}
        {data?.results.length === 0 && <li className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No registrations found.</li>}
        {data?.results.map((r) => (
          <li key={r.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2"><b className="text-sm text-slate-900">{r.full_name}</b><span className={`status-pill status-pill--${STRE_STATUS_TONE[r.status] ?? "slate"}`}>{r.status_label}</span></div>
            <p className="mt-1 font-mono text-xs text-slate-600">{r.registration_no}{r.roll_no ? ` · Roll ${r.roll_no}` : ""}</p>
            <p className="mt-1 break-all text-xs text-slate-500">{r.mobile} · {r.email}</p>
            <p className="mt-1 text-xs text-slate-500">{r.subject} · ₹{Number(r.amount).toLocaleString("en-IN")}{r.payment_reference ? ` · UTR ${r.payment_reference}` : ""}</p>
            <div className="mt-3">{rowActions(r)}</div>
          </li>
        ))}
      </ul>

      {data && data.count > 25 && (
        <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Page {page} of {pages}</span><div className="flex gap-2"><button className="btn-ghost" disabled={!data.previous} onClick={() => setPage((p) => p - 1)}>Previous</button><button className="btn-ghost" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>Next</button></div></div>
      )}

      {selected && (
        <Modal title={`${editing ? "Edit · " : ""}${selected.full_name} · ${selected.registration_no}`} onClose={() => { setSelected(null); setEditing(false); }}>
          {editing ? (
            <StreEditRegistration reg={selected} onCancel={() => setEditing(false)} onSaved={(updated) => { setSelected(updated); setEditing(false); load(); }} />
          ) : (
          <div className="space-y-4">
            {selected.status !== "cancelled" && <button type="button" className="btn-ghost w-full sm:w-auto" onClick={() => setEditing(true)}>Edit details (fix mistakes)</button>}
            <div className="flex flex-wrap items-end gap-4">
              {selected.photo_url && <img src={selected.photo_url} alt="Photo" className="h-32 w-24 rounded-lg border border-slate-200 object-cover" />}
              {selected.signature_url && <div><img src={selected.signature_url} alt="Signature" className="h-14 w-40 rounded border border-slate-200 bg-white object-contain" /><p className="mt-1 text-[10px] uppercase text-slate-500">Signature</p></div>}
              <span className={`status-pill status-pill--${STRE_STATUS_TONE[selected.status] ?? "slate"} ml-auto`}>{selected.status_label}</span>
            </div>
            <dl className="grid gap-x-4 sm:grid-cols-2">
              <Detail label="Father's name" value={selected.father_name} />
              <Detail label="Gender" value={selected.gender_label || selected.gender} />
              <Detail label="Caste category" value={selected.caste_category_label || selected.caste_category} />
              <Detail label="State" value={selected.state_label || streStateLabel(selected.state_code)} />
              <Detail label="Qualification" value={streClassLabel(selected.class_level)} />
              <Detail label={streSchoolFieldLabel(selected.class_level)} value={selected.school_name} />
              <div className="sm:col-span-2"><Detail label="Address" value={selected.address} /></div>
              <Detail label="Subject" value={selected.subject} />
              <Detail label="Email" value={selected.email} />
              <Detail label="Mobile" value={selected.mobile} />
              <Detail label="Aadhaar" value={selected.aadhaar_number} />
              <Detail label="Roll no." value={selected.roll_no} />
              <Detail label="Subject interest" value={selected.subject_interest} />
              <Detail label="Hobbies & interests" value={selected.interests} />
              <div className="sm:col-span-2"><Detail label="Aim of life" value={selected.aim_of_life} /></div>
              <Detail label="Fee" value={`₹${Number(selected.amount).toLocaleString("en-IN")} · ${selected.payment_method || "—"}`} />
              <Detail label="Payment reference" value={selected.payment_reference || selected.razorpay_payment_id} />
              <Detail label="Paid on" value={selected.paid_at ? formatDate(selected.paid_at) : ""} />
              <Detail label="Registered on" value={formatDate(selected.created_at)} />
            </dl>
            <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3">
              <button className="resource-action-btn resource-action-btn--danger" disabled={!!busy} onClick={() => {
                const paidWarning = selected.status === "paid" || selected.status === "admit_card_issued" ? "\n\n⚠️ This candidate has PAID the fee. Deleting removes the registration permanently (refund, if any, must be handled separately)." : "";
                const typed = window.prompt(`Delete registration ${selected.registration_no} of ${selected.full_name}? This cannot be undone.${paidWarning}\n\nType DELETE to confirm:`);
                if (typed?.trim().toUpperCase() !== "DELETE") { if (typed !== null) toast.error("Not deleted — you must type DELETE."); return; }
                run(`del-${selected.id}`, async () => { await api(`/stre/admin/registrations/${selected.id}/`, { method: "DELETE" }); setSelected(null); return `Registration ${selected.registration_no} deleted.`; });
              }}>Delete</button>
              {selected.status !== "cancelled" && selected.status !== "admit_card_issued" ? (
                <button className="resource-action-btn resource-action-btn--danger" disabled={!!busy} onClick={() => { const note = window.prompt("Reason for cancelling (optional)") ?? null; if (note === null) return; run(`cancel-${selected.id}`, async () => { await act(selected, "cancel", { note }); return "Registration cancelled."; }); }}>Cancel registration</button>
              ) : <span />}
              {rowActions(selected)}
            </div>
          </div>
          )}
        </Modal>
      )}
    </div>
  );
}
