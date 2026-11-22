import { ApiError } from "./api";

/** Indian mobile: 10 digits starting 6-9, optional +91 / 0 prefix. */
export const PHONE_PATTERN = "(\\+91[\\s\\-]?|0)?[6-9][0-9]{9}";
export const PHONE_HINT = "Enter a 10-digit mobile number, e.g. 9876543210";
/** School/office numbers may also be landlines (with STD code). */
export const LANDLINE_PATTERN = "(\\+91[\\s\\-]?)?[0-9][0-9\\s\\-]{7,13}";

export function isValidPhone(value: string) {
  return new RegExp(`^${PHONE_PATTERN}$`).test(value.trim());
}

/** Phone input me sirf digits, + aur space allow karo. */
export function cleanPhone(value: string) {
  return value.replace(/[^\d+\s-]/g, "").slice(0, 14);
}

/** "15/08/2012" -> "2012-08-15" (invalid -> "") */
export function dmyToIso(value: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return "";
  const [, dd, mm, yyyy] = m;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (date.getFullYear() !== Number(yyyy) || date.getMonth() !== Number(mm) - 1 || date.getDate() !== Number(dd)) return "";
  return `${yyyy}-${mm}-${dd}`;
}

/** "2012-08-15" -> "15/08/2012" */
export function isoToDmy(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Typing ke saath DD/MM/YYYY me slash khud lagao. */
export function maskDmy(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Date of birth check: valid date, past me, aur 2-100 saal ke beech. */
export function dobError(dmy: string): string {
  if (!dmy) return "Date of birth is required.";
  const iso = dmyToIso(dmy);
  if (!iso) return "Enter a real date in DD/MM/YYYY format, e.g. 15/08/2012.";
  const date = new Date(`${iso}T00:00:00`);
  const now = new Date();
  if (date > now) return "Date of birth cannot be in the future.";
  const age = (now.getTime() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (age < 2) return "The student must be at least 2 years old.";
  if (age > 100) return "Please check the year of birth.";
  return "";
}

/** Backend ke field errors {field: ["msg"]} ko {field: "msg"} me badlo. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.data || typeof error.data !== "object" || Array.isArray(error.data)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(error.data as Record<string, unknown>)) {
    if (key === "detail" || key === "non_field_errors") continue;
    const text = Array.isArray(value) ? value.map(String).join(" ") : typeof value === "string" ? value : "";
    if (text) out[key] = text;
  }
  return out;
}

/** Field errors ko labels ke saath ek readable line me jodo. */
export function readableError(error: unknown, labels: Record<string, string>, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  const fields = fieldErrors(error);
  const data = error.data as Record<string, unknown> | null;
  const general = data && typeof data === "object" ? [data.detail, data.non_field_errors].flat().filter(Boolean).map(String) : [];
  const parts = [...general, ...Object.entries(fields).map(([key, msg]) => `${labels[key] ?? key.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase())}: ${msg}`)];
  return parts.length ? parts.join(" ") : error.message || fallback;
}

/** Naam: sirf akshar (English/Hindi + matras), space . ' - ; kam se kam 2 akshar. */
export function nameError(value: string, required = true): string {
  const v = (value ?? "").trim().replace(/\s+/g, " ");
  if (!v) return required ? "This field is required." : "";
  if (!/^\p{L}[\p{L}\p{M} .'-]*$/u.test(v) || (v.match(/\p{L}/gu)?.length ?? 0) < 2) {
    return "Use letters only (spaces, . ' - allowed), at least 2 letters.";
  }
  return "";
}
