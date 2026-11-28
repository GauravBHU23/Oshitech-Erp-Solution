"use client";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { toast } from "@/lib/toast";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email + OTP verify. Verify hone par bagal me hara tick; token parent ko milta hai. */
export default function EmailOtpField({ value, onChange, token, onToken, error, id = "stre-email" }: {
  value: string;
  onChange: (email: string) => void;
  token: string;
  onToken: (token: string) => void;
  error?: string;
  id?: string;
}) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "verify">("");
  const [localError, setLocalError] = useState("");
  const [wait, setWait] = useState(0);
  const verified = !!token;

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  const send = async () => {
    const email = value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setLocalError("Enter a valid email address first, e.g. name@example.com."); return; }
    setBusy("send");
    setLocalError("");
    try {
      const res = await api<{ detail: string; resend_after: number }>("/stre/otp/send/", { method: "POST", body: { email }, silent: true });
      setSent(true);
      setCode("");
      setWait(res.resend_after || 60);
      toast.success(res.detail);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message.replace(/^(email|captcha):\s*/, "") : "Could not send the OTP.";
      setLocalError(msg);
      toast.error(msg);
    } finally {
      setBusy("");
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) { setLocalError("Enter the 6-digit OTP from your email."); return; }
    setBusy("verify");
    setLocalError("");
    try {
      const res = await api<{ email_token: string }>("/stre/otp/verify/", { method: "POST", body: { email: value.trim().toLowerCase(), code }, silent: true });
      onToken(res.email_token);
      setSent(false);
      toast.success("Email verified ✓");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message.replace(/^code:\s*/, "") : "Could not verify the OTP.";
      setLocalError(msg);
      toast.error(msg);
    } finally {
      setBusy("");
    }
  };

  const shownError = localError || error;

  return (
    <div className={`text-xs font-semibold text-slate-800 ${shownError ? "has-error" : ""}`}>
      <label htmlFor={id} className="flex items-center gap-2">
        Email ID<span className="text-red-500">*</span>
        {verified && <span className="email-verified inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"><Icon name="check" size={12} strokeWidth={3} />Verified</span>}
      </label>
      <div className="mt-1.5 flex gap-2">
        <span className="relative min-w-0 flex-1">
          <input
            id={id}
            className={`input ${verified ? "!border-emerald-400 !pr-10" : ""}`}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={value}
            readOnly={verified}
            aria-invalid={shownError ? true : undefined}
            onChange={(e) => { onChange(e.target.value); setLocalError(""); if (sent) setSent(false); }}
          />
          {verified && <span className="pointer-events-none absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-emerald-500 text-white" aria-label="Email verified"><Icon name="check" size={14} strokeWidth={3} /></span>}
        </span>
        {verified ? (
          <button type="button" className="btn-ghost shrink-0" onClick={() => { onToken(""); setCode(""); }}>Change</button>
        ) : (
          <button type="button" className="btn-primary shrink-0" disabled={busy === "send" || (sent && wait > 0)} onClick={send}>
            {busy === "send" ? <Spinner /> : sent ? (wait > 0 ? `Resend ${wait}s` : "Resend OTP") : "Verify email"}
          </button>
        )}
      </div>
      {sent && !verified && (
        <div className="otp-box mt-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-xs font-medium text-indigo-900">Enter the 6-digit OTP sent to <b>{value.trim()}</b> (check Spam too).</p>
          <div className="mt-2 flex gap-2">
            <input
              className="input !w-40 text-center font-mono text-lg tracking-[.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              aria-label="OTP"
              value={code}
              autoFocus
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setLocalError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void verify(); } }}
            />
            <button type="button" className="btn-primary" disabled={busy === "verify" || code.length !== 6} onClick={verify}>{busy === "verify" ? <Spinner /> : "Verify OTP"}</button>
          </div>
        </div>
      )}
      {shownError ? <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{shownError}</span>
        : !verified && !sent && <span className="mt-1 block text-[11px] font-normal text-slate-500">We will send a one-time code to verify this email.</span>}
    </div>
  );
}
