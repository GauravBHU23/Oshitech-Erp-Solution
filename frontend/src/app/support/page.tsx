"use client";

import Link from "next/link";
import { toast } from "@/lib/toast";
import { FormEvent, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import ThemeToggle from "@/components/ThemeToggle";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import TurnstileWidget from "@/components/TurnstileWidget";
import StreCaptcha, { type CaptchaValue } from "@/components/StreCaptcha";

const categories = [
  ["login", "Login problem"],
  ["bug", "Website issue"],
  ["account", "Account help"],
  ["question", "Question"],
  ["other", "Other"],
];

export default function SupportPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaValue>({ captcha_id: "", captcha: "" });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);

  useEffect(() => {
    if (user) setEmail(user.email);
  }, [user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user && captcha.captcha.length !== 5) { setError("Type the 5 characters shown in the image."); return; }
    if (!user && !turnstileToken) { setError("Please complete the verification check."); return; }
    setBusy(true);
    setError("");
    try {
      const ticket = await api<{ id: string }>("/support-requests/", {
        method: "POST",
        body: { email, category, subject, message, ...captcha, turnstile_token: turnstileToken },
      });
      setTicketId(ticket.id);
      toast.success("Report submitted. An administrator will review it.");
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Unable to submit your report. Please try again.");
    } finally {
      setBusy(false);
      setTurnstileToken("");
      setTurnstileKey((k) => k + 1);
    }
  };

  return (
    <main className="support-page min-h-screen bg-slate-50 px-4 py-10 sm:px-6 sm:py-16">
      <section className="support-panel mx-auto max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
        <div className="bg-[#172238] px-6 py-7 text-white sm:px-9">
          <div className="flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 transition hover:text-white"><Icon name="arrow" className="rotate-180" size={14} />Home</Link>
            <ThemeToggle />
          </div>
          <p className="mt-6 text-[10px] font-bold uppercase tracking-[.18em] text-cyan-200">Oshitech support</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Report a problem or ask a question</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">You can send this report even if you cannot sign in. An administrator will review it.</p>
        </div>
        {ticketId ? (
          <div className="px-6 py-10 text-center sm:px-9">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Icon name="check" size={22} /></span>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">Report sent</h2>
            <p className="mt-2 text-sm text-slate-500">The admin team has received your message. Reference: <span className="font-mono font-semibold text-slate-700">{ticketId.slice(0, 8).toUpperCase()}</span></p>
            <Link href="/" className="btn-primary mt-6 inline-flex">Back to home</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 px-6 py-7 sm:px-9">
            <label className="block text-xs font-semibold text-slate-700">
              Reply email
              <input className="input mt-1.5" type="email" autoComplete="email" required={!user} readOnly={Boolean(user)} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
              {!user && <span className="mt-1 block font-normal text-slate-400">Required so the admin can reply.</span>}
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              What do you need help with?
              <select className="input mt-1.5" value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Subject
              <input className="input mt-1.5" required maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Briefly describe the issue" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Message
              <textarea className="input mt-1.5 min-h-36" required minLength={10} maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tell us what happened and which page you were using." />
            </label>
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-900">Do not include your password or other sensitive information.</p>
            {!user && <StreCaptcha value={captcha} onChange={setCaptcha} reloadKey={turnstileKey} />}
            {!user && <TurnstileWidget token={turnstileToken} onChange={setTurnstileToken} reloadKey={turnstileKey} />}
            {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            <button type="submit" className="btn-primary inline-flex w-full items-center justify-center !py-3" disabled={busy}>
              {busy ? "Sending…" : "Send report"}<Icon name="arrow" className="ml-2" size={16} />
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
