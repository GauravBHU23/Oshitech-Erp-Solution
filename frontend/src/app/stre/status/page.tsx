"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api, NGROK_SKIP_BROWSER_WARNING_HEADERS } from "@/lib/api";
import type { StrePaymentInfo, StrePublicReg } from "@/lib/stre";
import { toast } from "@/lib/toast";
import { cleanPhone, isValidPhone } from "@/lib/validation";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import StrePayment from "@/components/StrePayment";
import StreShell from "@/components/StreShell";
import StreCaptcha, { type CaptchaValue } from "@/components/StreCaptcha";

type RegistrationStatus = Pick<StrePublicReg, "access_token" | "status" | "status_label" | "registration_no" | "amount" | "payment_reference" | "payment_attempts" | "last_payment_status" | "last_payment_error">;

export default function StreStatusPage() {
  const [regNo, setRegNo] = useState("");
  const [mobile, setMobile] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [captcha, setCaptcha] = useState<CaptchaValue>({ captcha_id: "", captcha: "" });
  const [captchaKey, setCaptchaKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reg, setReg] = useState<RegistrationStatus | null>(null);
  const [payment, setPayment] = useState<StrePaymentInfo | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [downloadingAdmitCard, setDownloadingAdmitCard] = useState(false);
  const [downloadingRegistration, setDownloadingRegistration] = useState(false);

  useEffect(() => {
    api<{ payment: StrePaymentInfo }>("/stre/public/").then((info) => setPayment(info.payment)).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const cfOrder = params.get("cf_order");
    if (token) {
      setLoadingToken(true);
      api<RegistrationStatus>(`/stre/status/?token=${encodeURIComponent(token)}`)
        .then(async (data) => {
          // Cashfree / UPI app se wapas aaye: payment server se confirm karo
          if (cfOrder && data.status === "payment_pending") {
            try {
              const updated = await api<RegistrationStatus>("/stre/pay/verify/", { method: "POST", body: { token, cf_order_id: cfOrder } });
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
    if (!/^[A-Z0-9]+-\d{6}$/.test(regNo.trim().toUpperCase())) e.registration_no = "Enter the registration number from your email, e.g. STRE2026-000123.";
    if (!isValidPhone(mobile)) e.mobile = "Enter the 10-digit mobile number used while registering.";
    if (captcha.captcha.length !== 5) e.captcha = "Type the 5 characters shown in the image.";
    setErrors(e);
    if (Object.keys(e).length) { toast.error("Please check the highlighted fields."); return; }
    setBusy(true);
    try {
      const data = await api<RegistrationStatus>("/stre/status/", { method: "POST", body: { registration_no: regNo.trim().toUpperCase(), mobile, ...captcha }, silent: true });
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

  const downloadPdf = async (urlPath: string, filename: string, failMessage: string) => {
    const response = await fetch(urlPath, {
      cache: "no-store",
      credentials: "same-origin",
      headers: NGROK_SKIP_BROWSER_WARNING_HEADERS,
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const detail = body && typeof body === "object" && "detail" in body && typeof body.detail === "string"
        ? body.detail
        : failMessage;
      throw new Error(detail);
    }
    const file = await response.blob();
    if (!file.size) throw new Error(`${failMessage} (empty file).`);
    const objectUrl = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const downloadAdmitCard = async () => {
    if (!reg || downloadingAdmitCard) return;
    setDownloadingAdmitCard(true);
    try {
      await downloadPdf(
        `/api/v1/stre/admit-card/${encodeURIComponent(reg.access_token)}/download/`,
        "STRE-Admit-Card.pdf",
        "Could not download the admit card. Please try again.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the admit card. Please try again.");
    } finally {
      setDownloadingAdmitCard(false);
    }
  };

  const downloadRegistration = async () => {
    if (!reg || downloadingRegistration) return;
    setDownloadingRegistration(true);
    try {
      await downloadPdf(
        `/api/v1/stre/registration/${encodeURIComponent(reg.access_token)}/download/`,
        "STRE-Registration.pdf",
        "Could not download the registration PDF. Please try again.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the registration PDF. Please try again.");
    } finally {
      setDownloadingRegistration(false);
    }
  };

  return (
    <StreShell support={false} notices={false}>
      <section className="relative isolate mb-5 overflow-hidden rounded-[28px] bg-[#0e172a] px-5 py-9 text-white sm:px-8 sm:py-11">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-indigo-500/30 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 h-60 w-60 rounded-full bg-fuchsia-400/15 blur-3xl" />
        <p className="relative text-[11px] font-bold uppercase tracking-[.2em] text-indigo-200">Student Talent Recognition Exam</p>
        <h1 className="relative mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Track your STRE registration</h1>
        <p className="relative mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">Use the registration number and mobile number from your application to check your status, payment confirmation, and admit-card updates.</p>
        <Link href="/stre" className="relative mt-5 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-indigo-200 transition hover:text-white">
          Go to STRE registration<Icon name="arrow" size={15} />
        </Link>
      </section>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start">
        <aside aria-labelledby="stre-status-intro-title" className="rounded-[28px] border border-indigo-100 bg-white p-6 shadow-lg shadow-indigo-950/[0.04] sm:p-8">
          <h2 id="stre-status-intro-title" className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">On this page</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
            <li className="flex items-start gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-indigo-600" />Application status</li>
            <li className="flex items-start gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-indigo-600" />Payment confirmation</li>
            <li className="flex items-start gap-2"><Icon name="ticket" size={16} className="mt-0.5 shrink-0 text-indigo-600" />Admit-card availability</li>
          </ul>
        </aside>
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
          <div className="space-y-5 p-5 sm:p-8">
          <h2 className="text-lg font-semibold text-slate-900">Registration status</h2>
          {loadingToken && <p className="text-sm text-slate-500"><Spinner className="mr-2" />Loading your registration…</p>}
          {!reg && !loadingToken && (
            <form onSubmit={lookup} noValidate className="space-y-5">
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2 sm:p-5">
                <label className={`block text-xs font-semibold text-slate-800 ${errors.registration_no ? "has-error" : ""}`}>Registration number<span className="text-red-500"> *</span>
                  <input className="input mt-1.5 bg-white uppercase" placeholder="STRE2026-000123" value={regNo} onChange={(e) => { setRegNo(e.target.value); setErrors((x) => ({ ...x, registration_no: "" })); }} />
                  {errors.registration_no && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors.registration_no}</span>}
                </label>
                <label className={`block text-xs font-semibold text-slate-800 ${errors.mobile ? "has-error" : ""}`}>Mobile number<span className="text-red-500"> *</span>
                  <input className="input mt-1.5 bg-white" type="tel" inputMode="tel" maxLength={14} placeholder="9876543210" value={mobile} onChange={(e) => { setMobile(cleanPhone(e.target.value)); setErrors((x) => ({ ...x, mobile: "" })); }} />
                  {errors.mobile && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors.mobile}</span>}
                </label>
                <div className="sm:col-span-2"><StreCaptcha value={captcha} onChange={(c) => { setCaptcha(c); setErrors((x) => ({ ...x, captcha: "" })); }} reloadKey={captchaKey} error={errors.captcha} /></div>
              </div>
              <button className="btn-primary w-full !py-3 text-sm sm:w-auto sm:px-10" disabled={busy}>{busy ? <Spinner /> : "Check status"}</button>
            </form>
          )}

          {reg && (
            <>
              {reg.status === "paid" || reg.status === "admit_card_issued" ? (
                <div role="status" aria-live="polite" className="flex items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><Icon name="check" size={22} strokeWidth={2.2} /></span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">Registration confirmed</h2>
                    <p className="mt-1 text-sm leading-6 text-emerald-900">
                      {Number(reg.amount) > 0
                        ? "Your payment has been received and verified. Your STRE registration is confirmed."
                        : "Your STRE registration is confirmed. No payment is due for this exam."}
                    </p>
                    <dl className="mt-4 grid gap-3 border-t border-emerald-200 pt-4 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-medium text-emerald-800">Registration number</dt>
                        <dd className="mt-1 font-semibold text-emerald-950">{reg.registration_no}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-emerald-800">Payment amount</dt>
                        <dd className="mt-1 font-semibold text-emerald-950">
                          {Number(reg.amount) > 0 ? `₹${Number(reg.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "No fee due"}
                        </dd>
                      </div>
                      {reg.payment_reference && (
                        <div className="sm:col-span-2">
                          <dt className="text-xs font-medium text-emerald-800">Payment reference</dt>
                          <dd className="mt-1 break-all font-semibold text-emerald-950">{reg.payment_reference}</dd>
                        </div>
                      )}
                    </dl>
                    <p className="mt-2 text-sm leading-6 text-emerald-800">
                      {reg.status === "admit_card_issued"
                        ? "Your admit card is ready to download below."
                        : "The exam cell will issue your admit card when it is ready. Check this page for updates."}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-center text-base font-semibold text-slate-900">Your form is {reg.status_label}.</p>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {(reg.status === "paid" || reg.status === "admit_card_issued") && (
                  <button type="button" onClick={() => void downloadRegistration()} disabled={downloadingRegistration} className="btn-primary w-full !py-3 sm:w-auto">
                    {downloadingRegistration ? <><Spinner className="mr-2" />Downloading…</> : <><Icon name="ticket" size={16} className="mr-2" />Download registration PDF</>}
                  </button>
                )}
                {reg.status === "admit_card_issued" && (
                  <button type="button" onClick={() => void downloadAdmitCard()} disabled={downloadingAdmitCard} className="btn-ghost w-full !py-3 sm:w-auto">
                    {downloadingAdmitCard ? <><Spinner className="mr-2" />Downloading…</> : <><Icon name="ticket" size={16} className="mr-2" />Download admit card</>}
                  </button>
                )}
                <button type="button" className="btn-ghost w-full !py-3 sm:w-auto" onClick={() => { setReg(null); window.history.replaceState(null, "", "/stre/status"); }}><Icon name="arrow" size={15} className="mr-2 rotate-180" />Check another registration</button>
              </div>
              {payment && (reg.status === "payment_pending" || reg.status === "payment_submitted") && (
                <StrePayment reg={reg} payment={payment} onUpdate={setReg} />
              )}
            </>
          )}
          </div>
        </section>
      </div>
    </StreShell>
  );
}
