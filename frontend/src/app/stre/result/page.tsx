"use client";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cleanPhone, isValidPhone } from "@/lib/validation";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import TurnstileWidget from "@/components/TurnstileWidget";
import StreCaptcha, { type CaptchaValue } from "@/components/StreCaptcha";
import StreShell from "@/components/StreShell";
import { useStreResultsOn } from "@/lib/streResults";
import ResultCard, { type StreResultData } from "@/components/StreResultCard";

export default function StreResultPage() {
  const [roll, setRoll] = useState("");
  const [mobile, setMobile] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaValue>({ captcha_id: "", captcha: "" });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StreResultData | null>(null);
  const [notice, setNotice] = useState("");
  const resultsOn = useStreResultsOn();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return;
    setBusy(true);
    api<StreResultData>(`/stre/result/?token=${encodeURIComponent(token)}`, { silent: true })
      .then(setResult)
      .catch((e) => setNotice(e instanceof ApiError ? e.message.replace(/^detail:\s*/, "") : "Could not load the result."))
      .finally(() => setBusy(false));
  }, []);

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    const e: Record<string, string> = {};
    if (!/^\d{6,12}$/.test(roll.trim())) e.roll_no = "Enter the roll number printed on your admit card.";
    if (!isValidPhone(mobile)) e.mobile = "Enter the 10-digit mobile number used while registering.";
    if (captcha.captcha.length !== 5) e.captcha = "Type the 5 characters shown in the image.";
    else if (!turnstileToken) e.captcha = "Please complete the verification check.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setNotice("");
    try {
      setResult(await api<StreResultData>("/stre/result/", { method: "POST", silent: true, body: { roll_no: roll.trim(), mobile: cleanPhone(mobile), ...captcha, turnstile_token: turnstileToken } }));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message.replace(/^(detail|captcha):\s*/, "") : "Could not load the result.";
      setNotice(msg);
      toast.error(msg);
      setCaptchaKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <StreShell>
      {!result && resultsOn === false ? (
        <section className="mx-auto max-w-lg rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-xl">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-700"><Icon name="clock" size={26} /></span>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">Result not declared yet</h1>
          <p className="mt-2 text-sm text-slate-500">The result will appear here as soon as the exam cell announces it. You will also get an email.</p>
        </section>
      ) : resultsOn === null ? (
        <p className="text-center text-sm text-slate-500"><Spinner className="mr-2" />Loading…</p>
      ) : result ? (
        <div className="space-y-4">
          <ResultCard r={result} />
          <button type="button" className="btn-ghost w-full !py-3 sm:w-auto" onClick={() => { setResult(null); window.history.replaceState(null, "", "/stre/result"); }}><Icon name="arrow" size={15} className="mr-2 rotate-180" />Check another result</button>
        </div>
      ) : (
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
          <div className="stre-hero bg-gradient-to-r from-violet-800 to-indigo-600 px-5 py-6 text-white sm:px-8">
            <p className="text-[11px] font-bold uppercase tracking-[.18em] text-violet-200">STRE</p>
            <h1 className="mt-2 text-2xl font-semibold">Check your result</h1>
            <p className="mt-1 text-sm text-violet-100">Enter the roll number from your admit card and your mobile number.</p>
          </div>
          <form onSubmit={lookup} noValidate className="space-y-4 p-5 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={`block text-xs font-semibold text-slate-800 ${errors.roll_no ? "has-error" : ""}`}>Roll number<span className="text-red-500"> *</span>
                <input className="input mt-1.5 font-mono" inputMode="numeric" maxLength={12} placeholder="e.g. 26000007" value={roll} onChange={(e) => { setRoll(e.target.value.replace(/\D/g, "")); setErrors((x) => ({ ...x, roll_no: "" })); }} />
                {errors.roll_no && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors.roll_no}</span>}
              </label>
              <label className={`block text-xs font-semibold text-slate-800 ${errors.mobile ? "has-error" : ""}`}>Mobile number<span className="text-red-500"> *</span>
                <input className="input mt-1.5" type="tel" inputMode="tel" maxLength={14} placeholder="9876543210" value={mobile} onChange={(e) => { setMobile(e.target.value); setErrors((x) => ({ ...x, mobile: "" })); }} />
                {errors.mobile && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors.mobile}</span>}
              </label>
            </div>
            <StreCaptcha value={captcha} onChange={(c) => { setCaptcha(c); setErrors((x) => ({ ...x, captcha: "" })); }} reloadKey={captchaKey} error={errors.captcha} />
            <TurnstileWidget token={turnstileToken} onChange={(t) => { setTurnstileToken(t); setErrors((x) => ({ ...x, captcha: "" })); }} reloadKey={captchaKey} />
            {notice && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
            <button className="btn-primary w-full !py-3 sm:w-auto" disabled={busy}>{busy ? <><Spinner className="mr-2" />Checking…</> : "View result"}</button>
          </form>
        </section>
      )}
    </StreShell>
  );
}
