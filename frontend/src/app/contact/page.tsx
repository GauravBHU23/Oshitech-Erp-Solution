"use client";
import Link from "next/link";
import { PHONE_HINT, PHONE_PATTERN } from "@/lib/validation";
import { toast } from "@/lib/toast";
import { FormEvent, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import MarketingFooter from "@/components/MarketingFooter";
import SiteHeader from "@/components/SiteHeader";
import Spinner from "@/components/Spinner";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import TurnstileWidget from "@/components/TurnstileWidget";
import StreCaptcha, { type CaptchaValue } from "@/components/StreCaptcha";

const CATEGORIES = [
  ["admission", "Admission enquiry"],
  ["contact", "General enquiry"],
  ["fees", "Fees enquiry"],
  ["account", "Account / login help"],
  ["question", "Question about the ERP"],
  ["other", "Other"],
] as const;

// Deployment ke hisaab se .env.local me set karein; khali ho to card nahi dikhta.
const CONTACT = {
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  phone: process.env.NEXT_PUBLIC_CONTACT_PHONE ?? "",
  address: process.env.NEXT_PUBLIC_CONTACT_ADDRESS ?? "",
  hours: process.env.NEXT_PUBLIC_CONTACT_HOURS ?? "Monday – Saturday, 9:00 AM – 5:00 PM",
};

export default function ContactPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", phone: "", school_code: "", category: "admission", subject: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaValue>({ captcha_id: "", captcha: "" });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, email: user.email, name: `${user.first_name} ${user.last_name}`.trim() }));
  }, [user]);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user && captcha.captcha.length !== 5) { setError("Type the 5 characters shown in the image."); return; }
    if (!user && !turnstileToken) { setError("Please complete the verification check."); return; }
    setBusy(true);
    setError("");
    try {
      const res = await api<{ id: string }>("/support-requests/", { method: "POST", body: { ...form, ...captcha, turnstile_token: turnstileToken } });
      setDone(res.id);
      toast.success("Message sent. The office will reply by email.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to send your message. Please try again.");
    } finally {
      setBusy(false);
      setTurnstileToken("");
      setTurnstileKey((k) => k + 1);
    }
  };

  const cards = [
    CONTACT.phone && { icon: "bell", label: "Call us", value: CONTACT.phone, href: `tel:${CONTACT.phone.replace(/\s/g, "")}` },
    CONTACT.email && { icon: "external", label: "Email", value: CONTACT.email, href: `mailto:${CONTACT.email}` },
    CONTACT.address && { icon: "school", label: "Visit", value: CONTACT.address, href: "" },
    { icon: "clock", label: "Office hours", value: CONTACT.hours, href: "" },
  ].filter(Boolean) as { icon: string; label: string; value: string; href: string }[];

  return (
    <main className="home-page contact-page min-h-screen bg-white text-slate-900">
      <SiteHeader />
      <section className="relative isolate overflow-hidden bg-[#0e172a] px-4 py-12 text-white sm:px-8 sm:py-16">
        <div className="absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="mx-auto max-w-7xl">
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-indigo-200">Contact us</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Admissions, fees or help with your account we are here.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Send us a message. If you add your school code, your enquiry goes straight to that school&apos;s office.</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:py-14">
        <div className="space-y-3">
          {cards.map((card) => {
            const body = (
              <>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon name={card.icon} size={18} /></span>
                <span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{card.label}</span><span className="mt-1 block break-words text-sm font-medium text-slate-800">{card.value}</span></span>
              </>
            );
            return card.href ? (
              <a key={card.label} href={card.href} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200">{body}</a>
            ) : (
              <div key={card.label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{body}</div>
            );
          })}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <b className="block text-slate-800">Already a student or staff member?</b>
            Sign in to your portal for results, fees, attendance and your ID card. Forgot your password? Ask your school office to reset it.
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/login" className="btn-primary !py-2 text-xs">Portal login</Link>
              <Link href="/support" className="btn-ghost !py-2 text-xs">Report a website problem</Link>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 sm:p-8">
          {done ? (
            <div role="status" className="py-8 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon name="check" size={26} /></div>
              <h2 className="mt-4 text-xl font-semibold text-slate-900">Message sent</h2>
              <p className="mt-2 text-sm text-slate-500">Thank you. The office will reply to {form.email}. Reference: <span className="font-mono">{done.slice(0, 8).toUpperCase()}</span></p>
              <button className="btn-ghost mt-6" onClick={() => { setDone(""); setForm((f) => ({ ...f, subject: "", message: "" })); }}>Send another message</button>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <h2 className="text-lg font-semibold text-slate-900 sm:col-span-2">Send a message</h2>
              <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600">Your name <span className="text-red-500">*</span></span><input className="input" required maxLength={150} autoComplete="name" value={form.name} onChange={set("name")} /></label>
              <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600">Email <span className="text-red-500">*</span></span><input className="input" type="email" required autoComplete="email" disabled={!!user} value={form.email} onChange={set("email")} /></label>
              <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600">Phone</span><input className="input" type="tel" inputMode="tel" maxLength={14} autoComplete="tel" pattern={PHONE_PATTERN} title={PHONE_HINT} placeholder="9876543210" value={form.phone} onChange={set("phone")} /></label>
              <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600">School code (optional)</span><input className="input uppercase" maxLength={20} placeholder="e.g. DPS01" value={form.school_code} onChange={set("school_code")} /></label>
              <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-600">Topic <span className="text-red-500">*</span></span>
                <select className="input" value={form.category} onChange={set("category")}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              </label>
              <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-600">Subject <span className="text-red-500">*</span></span><input className="input" required maxLength={160} value={form.subject} onChange={set("subject")} /></label>
              <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-600">Message <span className="text-red-500">*</span></span><textarea className="input" required minLength={10} maxLength={4000} rows={5} value={form.message} onChange={set("message")} /></label>
              {!user && <div className="sm:col-span-2"><StreCaptcha value={captcha} onChange={setCaptcha} reloadKey={turnstileKey} /></div>}
              {!user && <div className="sm:col-span-2"><TurnstileWidget token={turnstileToken} onChange={setTurnstileToken} reloadKey={turnstileKey} /></div>}
              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</div>}
              <div className="sm:col-span-2"><button className="btn-primary w-full !py-3 sm:w-auto" disabled={busy}>{busy ? <><Spinner className="mr-2" />Sending…</> : "Send message"}</button></div>
            </form>
          )}
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
