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
  slot_label?: string;
  slot_time?: string;
}

export interface StreExamSlot {
  id: string;
  label: string;
  reporting_time: string | null;
  slot_time: string;
  venue: string;
}

export const STRE_GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
] as const;

export function streGenderLabel(value?: string | null) {
  return STRE_GENDERS.find((item) => item.value === value)?.label ?? "";
}

export const STRE_CASTE_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "obc", label: "OBC" },
  { value: "sc", label: "SC" },
  { value: "st", label: "ST" },
  { value: "gen_ews", label: "Gen-EWS" },
] as const;

export function streCasteCategoryLabel(value?: string | null) {
  return STRE_CASTE_CATEGORIES.find((item) => item.value === value)?.label ?? "";
}

export const STRE_STATES = [
  { code: "35", name: "Andaman & Nicobar Islands" },
  { code: "28", name: "Andhra Pradesh" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "18", name: "Assam" },
  { code: "10", name: "Bihar" },
  { code: "22", name: "Chhattisgarh" },
  { code: "4", name: "Chandigarh" },
  { code: "7", name: "NCT of Delhi" },
  { code: "30", name: "Goa" },
  { code: "24", name: "Gujarat" },
  { code: "2", name: "Himachal Pradesh" },
  { code: "6", name: "Haryana" },
  { code: "20", name: "Jharkhand" },
  { code: "1", name: "Jammu & Kashmir" },
  { code: "29", name: "Karnataka" },
  { code: "32", name: "Kerala" },
  { code: "31", name: "Lakshadweep" },
  { code: "37", name: "Ladakh" },
  { code: "27", name: "Maharashtra" },
  { code: "17", name: "Meghalaya" },
  { code: "14", name: "Manipur" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "15", name: "Mizoram" },
  { code: "13", name: "Nagaland" },
  { code: "21", name: "Odisha" },
  { code: "3", name: "Punjab" },
  { code: "34", name: "Puducherry" },
  { code: "8", name: "Rajasthan" },
  { code: "11", name: "Sikkim" },
  { code: "33", name: "Tamil Nadu" },
  { code: "16", name: "Tripura" },
  { code: "36", name: "Telangana" },
  { code: "5", name: "Uttarakhand" },
  { code: "9", name: "Uttar Pradesh" },
  { code: "19", name: "West Bengal" },
] as const;

export function streStateLabel(code?: string | null) {
  return STRE_STATES.find((state) => state.code === code)?.name ?? "";
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

/** Grade 11+ ke liye "College / University Name", warna "School Name". */
export function streSchoolFieldLabel(classLevel?: string | null) {
  return classLevel && STRE_COLLEGE_LEVELS.has(classLevel) ? "College / University Name" : "School Name";
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
