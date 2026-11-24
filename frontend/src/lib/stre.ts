export interface StrePublicReg { results_published?: boolean;
  registration_no: string;
  access_token: string;
  full_name: string;
  email: string;
  mobile: string;
  subject: string;
  exam_title: string;
  exam_date: string;
  status: "payment_pending" | "payment_submitted" | "paid" | "admit_card_issued" | "cancelled";
  status_label: string;
  amount: string;
  payment_method: string;
  payment_reference: string;
  paid_at: string | null;
  roll_no: string;
  admit_card_issued_at: string | null;
  created_at: string;
  payment_attempts?: number;
  last_payment_status?: string;
  last_payment_error?: string;
}

export interface StrePaymentInfo { online: boolean; provider?: "cashfree" | "razorpay" | null; cashfree_mode?: "production" | "sandbox" | null; upi_id: string; form_url?: string; payee_name: string }

/** StrePayment component ko bas itna hi chahiye — status page is shape ko khud bana sakta hai, poora StrePublicReg nahi chahiye. */
export type StrePaymentReg = Pick<StrePublicReg, "status" | "access_token" | "registration_no" | "amount" | "payment_reference" | "payment_attempts" | "last_payment_status" | "last_payment_error">;

/** Class 1-12 ke baad college-level candidates bhi STRE de sakte hain. */
export const STRE_CLASS_LEVELS: { value: string; label: string }[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Class ${i + 1}` })),
  { value: "grad", label: "Graduation" },
  { value: "pg", label: "Post-Graduation" },
];
export const STRE_COLLEGE_LEVELS = new Set(["11", "12", "grad", "pg"]);

export function streClassLabel(value?: string | null) {
  return STRE_CLASS_LEVELS.find((c) => c.value === value)?.label ?? "";
}

/** Class 11+ ke liye "College / University name", warna "School name". */
export function streSchoolFieldLabel(classLevel?: string | null) {
  return classLevel && STRE_COLLEGE_LEVELS.has(classLevel) ? "College / University name" : "School name";
}

export const STRE_STATUS_TONE: Record<string, "green" | "amber" | "red" | "slate" | "indigo"> = {
  payment_pending: "amber",
  payment_submitted: "indigo",
  paid: "green",
  admit_card_issued: "green",
  cancelled: "red",
};

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type CashfreeResult = { error?: { message?: string }; paymentDetails?: unknown; redirect?: boolean };
declare global {
  interface Window {
    Cashfree?: (options: { mode: "production" | "sandbox" }) => { checkout: (options: { paymentSessionId: string; redirectTarget?: string }) => Promise<CashfreeResult> };
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (r: unknown) => void) => void } }
}

/** Razorpay checkout script sirf zaroorat par load karo. */
export function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/** Cashfree checkout SDK (v3) sirf zaroorat par load karo. */
export function loadCashfree(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Cashfree) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.onload = () => resolve(!!window.Cashfree);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
