"use client";
import { useState } from "react";
import { ApiError, api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { PHONE_HINT, cleanPhone, fieldErrors, isValidPhone, nameError } from "@/lib/validation";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

const CATEGORIES = [
  ["correction", "Correction in my registration"],
  ["payment", "Payment problem"],
  ["admit_card", "Admit card problem"],
  ["other", "Other question"],
] as const;

/** STRE candidate: "Raise a support request" — STRE admin ke inbox me jata hai. */
export default function StreSupportBox({ defaults }: { defaults?: { name?: string; email?: string; mobile?: string; registration_no?: string } }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: defaults?.name ?? "", email: defaults?.email ?? "", mobile: defaults?.mobile ?? "", registration_no: defaults?.registration_no ?? "", category: "correction", subject: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const set = (k: keyof typeof v, value: string) => { setV((s) => ({ ...s, [k]: value })); setErrors((e) => (e[k] ? { ...e, [k]: "" } : e)); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const e: Record<string, string> = {};
    const n = nameError(v.name); if (n) e.name = n;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = "Enter a valid email address.";
    if (!isValidPhone(v.mobile)) e.mobile = PHONE_HINT;
    if (v.subject.trim().length < 3) e.subject = "Write a short subject.";
    if (v.message.trim().length < 10) e.message = "Describe the problem in at least 10 characters.";
    if (Object.keys(e).length) { setErrors(e); toast.error("Please correct the fields marked in red."); return; }
    setBusy(true);
    try {
      const res = await api<{ ticket_no: string; detail: string }>("/stre/support/", { method: "POST", body: v, silent: true });
      setDone(res.ticket_no);
      toast.success(res.detail);
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      toast.error(Object.keys(fe).length ? "Please correct the fields marked in red." : err instanceof ApiError ? err.message : "Could not send. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const field = (k: keyof typeof v, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, required = true) => (
    <label className={`block text-xs font-semibold text-slate-800 ${errors[k] ? "has-error" : ""}`}>{label}{required && <span className="text-red-500"> *</span>}
      <input className="input mt-1.5" value={v[k]} aria-invalid={errors[k] ? true : undefined} onChange={(e) => set(k, k === "mobile" ? cleanPhone(e.target.value) : e.target.value)} {...props} />
      {errors[k] && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors[k]}</span>}
    </label>
  );

  return (
    <section className="stre-support rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <button type="button" className="flex w-full items-center gap-3 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-700"><Icon name="ticket" size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">Made a mistake or need help? Raise a support request</span>
          <span className="block text-xs text-slate-500">Wrong name, payment issue, admit card problem — the exam cell will sort it out and reply by email.</span>
        </span>
        <Icon name="arrow" size={16} className={`shrink-0 text-slate-400 transition ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open && (done ? (
        <div role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
          <b className="block">Request sent — ticket {done}</b>
          The exam cell will reply on {v.email}. Keep the ticket number for reference.
          <button type="button" className="mt-2 block text-xs font-semibold underline" onClick={() => { setDone(""); setV((s) => ({ ...s, subject: "", message: "" })); }}>Raise another request</button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-4 grid gap-3 sm:grid-cols-2">
          {field("name", "Your name", { maxLength: 150 })}
          {field("registration_no", "Registration number (if registered)", { maxLength: 30, placeholder: "STRE2026-000001", className: "input mt-1.5 uppercase" }, false)}
          {field("email", "Email", { type: "email", inputMode: "email" })}
          {field("mobile", "Mobile number", { type: "tel", inputMode: "tel", maxLength: 14, placeholder: "9876543210" })}
          <label className="block text-xs font-semibold text-slate-800 sm:col-span-2">Problem type<span className="text-red-500"> *</span>
            <select className="input mt-1.5" value={v.category} onChange={(e) => set("category", e.target.value)}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <div className="sm:col-span-2">{field("subject", "Subject", { maxLength: 160, placeholder: "e.g. Wrong spelling of my name" })}</div>
          <label className={`block text-xs font-semibold text-slate-800 sm:col-span-2 ${errors.message ? "has-error" : ""}`}>Describe the problem<span className="text-red-500"> *</span>
            <textarea className="input mt-1.5" rows={4} maxLength={3000} placeholder="What is wrong and what should it be?" value={v.message} aria-invalid={errors.message ? true : undefined} onChange={(e) => set("message", e.target.value)} />
            {errors.message && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors.message}</span>}
          </label>
          <div className="sm:col-span-2"><button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? <><Spinner className="mr-2" />Sending…</> : "Send to exam cell"}</button></div>
        </form>
      ))}
    </section>
  );
}
