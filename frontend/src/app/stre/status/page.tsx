"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { STRE_STATUS_TONE, formatDate, type StrePaymentInfo, type StrePublicReg } from "@/lib/stre";
import { toast } from "@/lib/toast";
import { cleanPhone, isValidPhone } from "@/lib/validation";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import StrePayment from "@/components/StrePayment";
import StreShell from "@/components/StreShell";
import StreCaptcha, { type CaptchaValue } from "@/components/StreCaptcha";

export default function StreStatusPage() {
  const [regNo, setRegNo] = useState("");
  const [mobile, setMobile] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [captcha, setCaptcha] = useState<CaptchaValue>({ captcha_id: "", captcha: "" });
  const [captchaKey, setCaptchaKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reg, setReg] = useState<StrePublicReg | null>(null);
  const [payment, setPayment] = useState<StrePaymentInfo | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);

  useEffect(() => {
    api<{ payment: StrePaymentInfo }>("/stre/public/").then((d) => setPayment(d.payment)).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const cfOrder = params.get("cf_order");
    if (token) {
      setLoadingToken(true);
      api<StrePublicReg>(`/stre/status/?token=${encodeURIComponent(token)}`)
        .then(async (data) => {
          // Cashfree / UPI app se wapas aaye: payment server se confirm karo
          if (cfOrder && data.status === "payment_pending") {
            try {
              const updated = await api<StrePublicReg>("/stre/pay/verify/", { method: "POST", body: { token, cf_order_id: cfOrder } });
              if (updated.status !== "payment_pending") toast.success("Payment successful. A confirmation email has been sent.");
              data = updated;
            } catch { /* api() shows why (e.g. still processing) */ }
          }
          if (cfOrder) window.history.replaceState(null, "", `/stre/status?token=${token}`);
          setReg(data);
        })
        .catch(() => toast.error("This link is not valid. Search with your registration number instead."))
        .finally(() => setLoadingToken(false));
    }
  }, []);

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    const e: Record<string, string> = {};
    if (!/^[A-Z0-9]+-\d{6}$/.test(regNo.trim().toUpperCase())) e.registration_no = "Enter the registration number from your email, e.g. STRE26-000123.";
    if (!isValidPhone(mobile)) e.mobile = "Enter the 10-digit mobile number used while registering.";
    if (captcha.captcha.length !== 5) e.captcha = "Type the 5 characters shown in the image.";
    setErrors(e);
    if (Object.keys(e).length) { toast.error("Please check the highlighted fields."); return; }
    setBusy(true);
    try {
      const data = await api<StrePublicReg>("/stre/status/", { method: "POST", body: { registration_no: regNo.trim().toUpperCase(), mobile, ...captcha }, silent: true });
      setReg(data);
      window.history.replaceState(null, "", `/stre/status?token=${data.access_token}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message.replace(/^captcha:s*/, "") : "Could not find the registration.";
      if (err instanceof ApiError && /captcha/i.test(err.message)) setErrors((x) => ({ ...x, captcha: msg }));
      toast.error(msg);
      setCaptchaKey((k) => k + 1); // har koshish ke baad naya captcha
    } finally {
      setBusy(false);
    }
  };

  return (
    <StreShell>
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
        <header className="bg-gradient-to-r from-[#3b1d6e] to-[#4f46e5] px-5 py-6 text-white sm:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-indigo-200">STRE</p>
          <h1 className="mt-1 text-2xl font-semibold">Registration status & admit card</h1>
        </header>
        <div className="space-y-5 p-5 sm:p-8">
          {loadingToken && <p className="text-sm text-slate-500"><Spinner className="mr-2" />Loading your registration…</p>}
          {!reg && !loadingToken && (
            <form onSubmit={lookup} noValidate className="grid gap-3 sm:grid-cols-2 sm:items-start">
              <label className={`block text-xs font-semibold text-slate-800 ${errors.registration_no ? "has-error" : ""}`}>Registration number<span className="text-red-500"> *</span>
                <input className="input mt-1.5 uppercase" placeholder="STRE26-000123" value={regNo} onChange={(e) => { setRegNo(e.target.value); setErrors((x) => ({ ...x, registration_no: "" })); }} />
                {errors.registration_no && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors.registration_no}</span>}
              </label>
              <label className={`block text-xs font-semibold text-slate-800 ${errors.mobile ? "has-error" : ""}`}>Mobile number<span className="text-red-500"> *</span>
                <input className="input mt-1.5" type="tel" inputMode="tel" maxLength={14} placeholder="9876543210" value={mobile} onChange={(e) => { setMobile(cleanPhone(e.target.value)); setErrors((x) => ({ ...x, mobile: "" })); }} />
                {errors.mobile && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors.mobile}</span>}
              </label>
              <div className="sm:col-span-2"><StreCaptcha value={captcha} onChange={(c) => { setCaptcha(c); setErrors((x) => ({ ...x, captcha: "" })); }} reloadKey={captchaKey} error={errors.captcha} /></div>
              <button className="btn-primary w-full !py-2.5 sm:col-span-2 sm:w-auto sm:justify-self-start" disabled={busy}>{busy ? <Spinner /> : "Check status"}</button>
            </form>
          )}

          {reg && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{reg.full_name}</p>
                  <p className="text-xs text-slate-500">{reg.exam_title} · {formatDate(reg.exam_date)}</p>
                </div>
                <span className={`status-pill status-pill--${STRE_STATUS_TONE[reg.status] ?? "slate"}`}>{reg.status_label}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {[["Registration no.", reg.registration_no], ["Roll no.", reg.roll_no || "After fee payment"], ["Subject", reg.subject], ["Fee", Number(reg.amount) > 0 ? `₹${Number(reg.amount).toLocaleString("en-IN")}` : "Free"]].map(([k, val]) => (
                  <div key={k} className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k}</p><p className="mt-1 break-words font-semibold text-slate-900">{val}</p></div>
                ))}
              </div>
              {payment && <StrePayment reg={reg} payment={payment} onUpdate={setReg} />}
              {reg.status === "paid" && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Payment received{reg.paid_at ? ` on ${formatDate(reg.paid_at)}` : ""}. Your registration is confirmed{reg.roll_no ? ` (Roll no. ${reg.roll_no})` : ""} and your admit card will be emailed shortly.</p>}
              {reg.status === "cancelled" && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">This registration has been cancelled. Contact the exam cell if you think this is a mistake.</p>}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {reg.status === "admit_card_issued" && (
                  <Link href={`/stre/admit-card/${reg.access_token}`} className="btn-primary w-full !py-3 sm:w-auto"><Icon name="ticket" size={16} className="mr-2" />View & download admit card</Link>
                )}
                {reg.status === "admit_card_issued" && (
                  <Link href={`/stre/result?token=${reg.access_token}`} className="btn-primary w-full !py-3 sm:w-auto"><Icon name="award" size={16} className="mr-2" />View result</Link>
                )}
                <button type="button" className="btn-ghost w-full !py-3 sm:w-auto" onClick={() => { setReg(null); window.history.replaceState(null, "", "/stre/status"); }}><Icon name="arrow" size={15} className="mr-2 rotate-180" />Check another registration</button>
              </div>
            </>
          )}
          <p className="border-t border-slate-100 pt-4 text-xs text-slate-500">Not registered yet? <Link href="/stre" className="font-semibold text-indigo-600 hover:underline">Register for STRE</Link></p>
        </div>
      </section>
    </StreShell>
  );
}
