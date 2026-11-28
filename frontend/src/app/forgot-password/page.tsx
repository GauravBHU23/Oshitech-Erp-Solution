"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { portalBySlug } from "@/lib/portals";
import { toast } from "@/lib/toast";
import { fieldErrors } from "@/lib/validation";
import Icon from "@/components/Icon";
import PasswordInput from "@/components/PasswordInput";
import Spinner from "@/components/Spinner";
import ThemeToggle from "@/components/ThemeToggle";
import TurnstileWidget from "@/components/TurnstileWidget";
import StreCaptcha, { type CaptchaValue } from "@/components/StreCaptcha";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ERP portals ka "Forgot password": email par 6-digit code, phir naya password. */
export default function ForgotPasswordPage() {
  const [portal, setPortal] = useState("student");
  const [step, setStep] = useState<"email" | "reset" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [captcha, setCaptcha] = useState<CaptchaValue>({ captcha_id: "", captcha: "" });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("portal");
    if (p && portalBySlug(p)) setPortal(p);
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  const info = portalBySlug(portal);
  const loginHref = `/login/${info ? portal : "student"}`;

  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) { setErrors({ email: "Enter the email you use to sign in, e.g. name@example.com." }); return; }
    if (captcha.captcha.length !== 5) { setErrors({ captcha: "Type the 5 characters shown in the image." }); return; }
    if (!turnstileToken) { setErrors({ captcha: "Please complete the verification check." }); return; }
    setBusy(true);
    setErrors({});
    try {
      const res = await api<{ detail: string; resend_after: number }>("/auth/forgot-password/", { method: "POST", body: { email: value, portal, ...captcha, turnstile_token: turnstileToken }, silent: true });
      toast.success(res.detail);
      setStep("reset");
      setWait(res.resend_after || 60);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message.replace(/^(email|captcha):\s*/, "") : "Could not send the code.";
      setErrors({ email: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
      setTurnstileToken("");
      setTurnstileKey((k) => k + 1);
    }
  };

  const reset = async (event: React.FormEvent) => {
    event.preventDefault();
    const e: Record<string, string> = {};
    if (!/^\d{6}$/.test(code)) e.code = "Enter the 6-digit code from your email.";
    if (password.length < 10) e.new_password = "Use at least 10 characters.";
    else if (password !== confirm) e.confirm = "Both passwords must match.";
    if (Object.keys(e).length) { setErrors(e); toast.error("Please correct the fields marked in red."); return; }
    setBusy(true);
    setErrors({});
    try {
      const res = await api<{ detail: string }>("/auth/forgot-password/confirm/", { method: "POST", body: { email: email.trim().toLowerCase(), code, new_password: password, portal }, silent: true });
      toast.success(res.detail);
      setStep("done");
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(Object.keys(fe).length ? fe : { code: err instanceof ApiError ? err.message : "Could not reset the password." });
      toast.error(Object.values(fe)[0] ?? (err instanceof ApiError ? err.message : "Could not reset the password."));
    } finally {
      setBusy(false);
    }
  };

  const err = (k: string) => errors[k] && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors[k]}</span>;

  return (
    <main className="auth-page flex min-h-[100dvh] items-start justify-center bg-[#f6f7fb] px-3 pb-24 pt-3 sm:items-center sm:px-6 sm:py-12">
      <section className="w-full max-w-md overflow-hidden rounded-[28px] border border-white bg-white shadow-xl shadow-slate-200/70">
        <div className="bg-[#172238] px-6 py-6 text-white">
          <div className="flex items-center justify-between gap-2">
            <Link href={loginHref} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white"><Icon name="arrow" size={14} className="rotate-180" />Back to sign in</Link>
            <ThemeToggle />
          </div>
          <span className="mt-5 grid h-11 w-11 place-items-center rounded-xl bg-indigo-500/20 text-indigo-200"><Icon name="key" size={20} /></span>
          <h1 className="mt-3 text-2xl font-semibold">Forgot password?</h1>
          <p className="mt-1 text-sm text-slate-300">We will email a code if this address matches an account for this sign-in.</p>
        </div>

        <div className="p-6">
          {step === "email" && (
            <form onSubmit={requestCode} noValidate className="space-y-4">
              <label className={`block text-sm ${errors.email ? "has-error" : ""}`}>
                <span className="mb-1.5 block font-medium text-slate-700">Email address<span className="text-red-500"> *</span></span>
                <input className="input !py-3" type="email" inputMode="email" autoComplete="username" placeholder="name@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setErrors({}); }} />
                {err("email")}
              </label>
              <StreCaptcha value={captcha} onChange={(c) => { setCaptcha(c); setErrors((x) => ({ ...x, captcha: "" })); }} reloadKey={turnstileKey} error={errors.captcha} />
              <TurnstileWidget token={turnstileToken} onChange={(t) => { setTurnstileToken(t); setErrors((x) => ({ ...x, captcha: "" })); }} reloadKey={turnstileKey} />
              <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? <><Spinner className="mr-2" />Sending…</> : "Send reset code"}</button>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={reset} noValidate className="space-y-4">
              <p className="rounded-xl bg-indigo-50 px-3 py-2.5 text-xs leading-5 text-indigo-900">If <b>{email.trim()}</b> matches an account for this sign-in, a 6-digit code has been sent. Check Spam too.</p>
              <label className={`block text-sm ${errors.code ? "has-error" : ""}`}>
                <span className="mb-1.5 block font-medium text-slate-700">6-digit code<span className="text-red-500"> *</span></span>
                <input className="input !py-3 text-center font-mono text-xl tracking-[.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErrors((x) => ({ ...x, code: "" })); }} />
                {err("code")}
              </label>
              <label className={`block text-sm ${errors.new_password ? "has-error" : ""}`}>
                <span className="mb-1.5 block font-medium text-slate-700">New password<span className="text-red-500"> *</span></span>
                <PasswordInput className="input !py-3" autoComplete="new-password" placeholder="At least 10 characters" value={password} onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, new_password: "" })); }} />
                {err("new_password")}
              </label>
              <label className={`block text-sm ${errors.confirm ? "has-error" : ""}`}>
                <span className="mb-1.5 block font-medium text-slate-700">Confirm new password<span className="text-red-500"> *</span></span>
                <PasswordInput className="input !py-3" autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, confirm: "" })); }} />
                {err("confirm")}
              </label>
              <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? <><Spinner className="mr-2" />Saving…</> : "Set new password"}</button>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{wait > 0 ? `You can request a new code in ${wait}s` : "Didn't get the code?"}</span>
                <button type="button" className="font-semibold text-indigo-600 hover:underline disabled:text-slate-400 disabled:no-underline" disabled={wait > 0} onClick={() => { setStep("email"); setCode(""); setErrors({}); }}>Resend / change email</button>
              </div>
            </form>
          )}

          {step === "done" && (
            <div className="text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon name="check" size={26} /></span>
              <h2 className="mt-3 text-lg font-semibold text-slate-900">Password changed</h2>
              <p className="mt-1 text-sm text-slate-500">You have been signed out on other devices. Sign in with your new password.</p>
              <Link href={loginHref} className="btn-primary mt-5 w-full !py-3">Go to sign in</Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
