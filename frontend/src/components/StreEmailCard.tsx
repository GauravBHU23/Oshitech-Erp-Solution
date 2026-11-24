"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

type Status = { mode: string; sends_real_email: boolean; host: string; user: string; from_email: string; site_url: string };

/** STRE admin: email set hai ya nahi + test email bhejo. */
export default function StreEmailCard({ defaultTo }: { defaultTo: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<Status>("/stre/admin/email/").then(setStatus).catch(() => {}); }, []);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await api<Status & { detail: string }>("/stre/admin/email/", { method: "POST", body: { to } });
      setStatus(res);
      toast.success(res.detail);
    } catch { /* api() shows the error toast with the SMTP reason */ } finally {
      setBusy(false);
    }
  };

  const ok = status?.sends_real_email;
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><Icon name="bell" /></span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Email (registration, payment & admit card mails)</h2>
            {!status ? <p className="mt-1 text-xs text-slate-500">Checking…</p> : ok ? (
              <p className="mt-1 text-xs leading-5 text-slate-600">Sending real email via <b>{status.host}</b> as <b>{status.user}</b>. From: {status.from_email}</p>
            ) : (
              <p className="mt-1 text-xs leading-5 text-amber-800">Not sending real email yet — mails are only printed in the backend terminal. Add your SMTP details in <code className="rounded bg-amber-100 px-1">backend/.env</code> and restart the backend.</p>
            )}
          </div>
        </div>
        {status && <span className={`status-pill ${ok ? "status-pill--green" : "status-pill--amber"}`}>{ok ? "Connected" : "Development mode"}</span>}
      </div>
      <form onSubmit={send} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input className="input" type="email" required aria-label="Send test email to" placeholder="you@example.com" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn-ghost shrink-0" disabled={busy}>{busy ? <><Spinner className="mr-2" />Sending…</> : "Send test email"}</button>
      </form>
    </section>
  );
}
