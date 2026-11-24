"use client";
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
    if (!/^[A-Z0-9]+-\d{6}$/.test(regNo.trim().toUpperCase())) e.registration_no = "Enter the registration number from your email, e.g. STRE26-000123.";
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

  const downloadAdmitCard = async () => {
    if (!reg || downloadingAdmitCard) return;
    setDownloadingAdmitCard(true);
    try {
      const response = await fetch(`/api/v1/stre/admit-card/${encodeURIComponent(reg.access_token)}/download/`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: NGROK_SKIP_BROWSER_WARNING_HEADERS,
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const detail = body && typeof body === "object" && "detail" in body && typeof body.detail === "string"
          ? body.detail
          : "Could not download the admit card. Please try again.";
        throw new Error(detail);
      }
      const file = await response.blob();
      if (!file.size) throw new Error("The admit card download was empty. Please try again.");
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "STRE-Admit-Card.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the admit card. Please try again.");
    } finally {
      setDownloadingAdmitCard(false);
    }
  };

  return (
    <StreShell support={false} notices={false}>
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
        <header className="bg-gradient-to-r from-[#3b1d6e] to-[#4f46e5] px-5 py-6 text-white sm:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-indigo-200">STRE</p>
          <h1 className="mt-1 text-2xl font-semibold">Registration status</h1>
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
              <p className="text-center text-base font-semibold text-slate-900">Your form is {reg.status_label}.</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {reg.status === "admit_card_issued" && (
                  <button type="button" onClick={() => void downloadAdmitCard()} disabled={downloadingAdmitCard} className="btn-primary w-full !py-3 sm:w-auto">
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
    </StreShell>
  );
}
