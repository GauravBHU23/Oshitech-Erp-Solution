"use client";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { loadCashfree, loadRazorpay, type StrePaymentInfo, type StrePublicReg } from "@/lib/stre";
import { toast } from "@/lib/toast";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

/** Fee payment: Razorpay (agar configured) ya UPI se pay karke transaction ID. */
export default function StrePayment({ reg, payment, onUpdate, autoStart = false }: { reg: StrePublicReg; payment: StrePaymentInfo; onUpdate: (r: StrePublicReg) => void; autoStart?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(
    reg.last_payment_status === "failed" || reg.last_payment_status === "cancelled" ? (reg.last_payment_error || "Your last payment attempt was not completed.") : "",
  );
  const startRef = useRef<(() => void) | null>(null);
  const autoStarted = useRef(false);
  // Registration ke turant baad payment window apne aap kholo (sirf ek baar)
  useEffect(() => {
    if (!autoStart || autoStarted.current || reg.status !== "payment_pending" || !payment.online) return;
    autoStarted.current = true;
    const t = window.setTimeout(() => startRef.current?.(), 600);
    return () => window.clearTimeout(t);
  }, [autoStart, reg.status, payment.online]);
  const [utr, setUtr] = useState("");
  const [utrError, setUtrError] = useState("");

  if (reg.status === "payment_submitted" && !payment.online) {
    return (
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
        <b className="block">Payment submitted — waiting for verification</b>
        Transaction ID <span className="font-mono">{reg.payment_reference}</span> has been sent to the exam cell. You will get an email once it is verified.
      </div>
    );
  }
  if (reg.status !== "payment_pending" && reg.status !== "payment_submitted") return null;

  const reportFailure = (reason: string) => {
    setFailure(reason);
    api("/stre/pay/failed/", { method: "POST", body: { token: reg.access_token, reason }, silent: true }).catch(() => {});
  };

  const verifyCashfree = async (orderId: string) => {
    try {
      const updated = await api<StrePublicReg>("/stre/pay/verify/", { method: "POST", body: { token: reg.access_token, cf_order_id: orderId }, silent: true });
      if (updated.status !== "payment_pending") { setFailure(""); toast.success("Payment successful. A confirmation email has been sent."); }
      onUpdate(updated);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Payment could not be confirmed.";
      setFailure(msg);
      toast.error(msg);
    }
  };

  const payCashfree = async () => {
    setBusy(true);
    setFailure("");
    try {
      const [ok, order] = await Promise.all([
        loadCashfree(),
        api<{ order_id: string; payment_session_id: string; mode: "production" | "sandbox" }>("/stre/pay/order/", { method: "POST", body: { token: reg.access_token } }),
      ]);
      if (!ok || !window.Cashfree) throw new Error("Could not load the payment window. Check your internet connection.");
      const cashfree = window.Cashfree({ mode: order.mode });
      const result = await cashfree.checkout({ paymentSessionId: order.payment_session_id, redirectTarget: "_modal" });
      if (result.redirect) return; // UPI app / bank page par gaya; wapas aane par status page verify karega
      if (result.error && !result.paymentDetails) {
        const reason = result.error.message ? `Payment not completed: ${result.error.message}` : "Payment window was closed before paying.";
        reportFailure(reason);
        toast.info(reason);
        return;
      }
      await verifyCashfree(order.order_id);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Could not start the payment.";
      reportFailure(reason);
      if (!(e instanceof ApiError)) toast.error(reason);
    } finally {
      setBusy(false);
    }
  };

  const payOnline = async () => {
    if (payment.provider === "cashfree") return payCashfree();
    setBusy(true);
    try {
      const ok = await loadRazorpay();
      if (!ok || !window.Razorpay) throw new Error("Could not load the payment window. Check your internet connection.");
      const order = await api<Record<string, string | number>>("/stre/pay/order/", { method: "POST", body: { token: reg.access_token } });
      const rzp = new window.Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: "STRE Exam Cell",
        description: order.description,
        prefill: { name: order.name, email: order.email, contact: order.mobile },
        theme: { color: "#4f46e5" },
        handler: async (response: Record<string, string>) => {
          try {
            const updated = await api<StrePublicReg>("/stre/pay/verify/", { method: "POST", body: { token: reg.access_token, ...response } });
            toast.success("Payment successful. A confirmation email has been sent.");
            onUpdate(updated);
          } catch { /* api() already shows the error toast */ }
        },
        modal: { ondismiss: () => reportFailure("Payment window was closed before paying.") },
      });
      rzp.on("payment.failed", () => { reportFailure("Payment failed at the bank / UPI app."); toast.error("Payment failed. No money was taken, or it will be refunded by your bank. Please try again."); });
      rzp.open();
    } catch (e) {
      if (!(e instanceof ApiError)) toast.error(e instanceof Error ? e.message : "Could not start the payment.");
    } finally {
      setBusy(false);
    }
  };

  startRef.current = () => { void payOnline(); };

  const submitUtr = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = utr.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z0-9]{6,30}$/.test(value)) { setUtrError("Enter the Payment ID / UTR (6–30 letters or numbers) shown after payment."); return; }
    setBusy(true);
    setUtrError("");
    try {
      const updated = await api<StrePublicReg>("/stre/pay/manual/", { method: "POST", body: { token: reg.access_token, reference: value }, silent: true });
      toast.success("Payment ID submitted. The exam cell will verify it and email you.");
      onUpdate(updated);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message.replace(/^reference:\s*/, "") : "Could not submit. Try again.";
      setUtrError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stre-pay space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-amber-700">Fee payment pending</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">₹{Number(reg.amount).toLocaleString("en-IN")}</p>
        </div>
        {payment.online && (
          <button type="button" className="btn-primary !py-3" disabled={busy} onClick={payOnline}>
            {busy ? <><Spinner className="mr-2" />Opening…</> : <><Icon name="wallet" size={16} className="mr-2" />{failure ? "Retry payment" : `Pay ₹${Number(reg.amount).toLocaleString("en-IN")} online`}</>}
          </button>
        )}
      </div>
      {reg.status === "payment_submitted" && (
        <p className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">
          An earlier Payment ID (<span className="font-mono">{reg.payment_reference}</span>) was submitted but could not be verified automatically. Pay online here to confirm your registration instantly — your roll number and admit card come by email right away.
        </p>
      )}
      {failure && (
        <div role="alert" className="stre-pay-failed rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:p-4">
          <b className="block">Payment not completed</b>
          <span className="mt-0.5 block break-words text-xs leading-5">{failure}{reg.payment_attempts ? ` · Attempts: ${reg.payment_attempts}` : ""}</span>
          <span className="mt-1 block text-xs leading-5">No money is taken for a failed payment. If money was deducted, it is confirmed automatically or refunded by your bank.</span>
          {payment.online && <button type="button" className="btn-primary mt-3 w-full sm:w-auto" disabled={busy} onClick={payOnline}>{busy ? <><Spinner className="mr-2" />Opening…</> : <><Icon name="wallet" size={16} className="mr-2" />Retry payment</>}</button>}
        </div>
      )}
      {payment.form_url && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <p className="text-sm font-semibold text-slate-800">{payment.online ? "Or pay using our Cashfree payment link" : "Pay using our Cashfree payment link"}</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs leading-5 text-slate-600">
            <li>Open the payment link and pay ₹{Number(reg.amount).toLocaleString("en-IN")}.</li>
            <li>In the form, enter your Registration Number <b className="select-all font-mono text-slate-900">{reg.registration_no}</b>.</li>
            <li>After paying, enter the <b>Payment ID</b> / transaction ID below so the exam cell can verify it.</li>
          </ol>
          <a href={payment.form_url} target="_blank" rel="noopener noreferrer" className={`${payment.online ? "btn-ghost" : "btn-primary !py-3"} mt-3 w-full sm:w-auto`}><Icon name="external" size={15} className="mr-2" />{payment.online ? "Open payment link" : `Pay ₹${Number(reg.amount).toLocaleString("en-IN")} — open payment link`}</a>
        </div>
      )}
      {payment.upi_id && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <p className="text-sm font-semibold text-slate-800">{payment.online || payment.form_url ? "Or pay by UPI" : "Pay by UPI"}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Send ₹{Number(reg.amount).toLocaleString("en-IN")} to UPI ID <b className="select-all font-mono text-slate-900">{payment.upi_id}</b>
            {payment.payee_name ? ` (${payment.payee_name})` : ""}. Write your registration number <b>{reg.registration_no}</b> in the note.
          </p>
        </div>
      )}
      {(payment.upi_id || payment.form_url) && (
        <form onSubmit={submitUtr} noValidate className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <p className="text-sm font-semibold text-slate-800">Already paid by link / UPI?</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
            <label className="flex-1 text-xs font-semibold text-slate-700">Payment ID / UPI transaction ID (UTR)<span className="text-red-500"> *</span>
              <input className="input mt-1 uppercase" inputMode="text" maxLength={30} placeholder="e.g. 412345678901" value={utr} aria-invalid={utrError ? true : undefined} onChange={(e) => { setUtr(e.target.value); setUtrError(""); }} />
              {utrError && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{utrError}</span>}
            </label>
            <button className="btn-primary sm:mt-5" disabled={busy}>{busy ? <Spinner /> : "Submit for verification"}</button>
          </div>
        </form>
      )}
      {!payment.online && !payment.upi_id && !payment.form_url && (
        <p className="text-sm text-slate-700">Payment details will be shared by the exam cell. Please contact the office with your registration number.</p>
      )}
    </div>
  );
}
