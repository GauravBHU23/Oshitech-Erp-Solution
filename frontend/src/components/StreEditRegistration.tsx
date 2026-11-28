"use client";
import { useState } from "react";
import { ApiError, api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { imageErrorMessage, shrinkPhoto, shrinkSignature } from "@/lib/image";
import { PHONE_HINT, cleanPhone, fieldErrors, isValidPhone, nameError } from "@/lib/validation";
import type { Row } from "@/lib/types";
import Spinner from "@/components/Spinner";
import { STRE_CASTE_CATEGORIES, STRE_GENDERS, STRE_STATES, STRE_CLASS_LEVELS, streSchoolFieldLabel } from "@/lib/stre";

const LABELS: Record<string, string> = {
  first_name: "First Name", last_name: "Last Name", email: "Email", mobile: "Mobile", father_name: "Father's Name", gender: "Gender", caste_category: "Caste Category", state_code: "State", school_name: "School / College Name", class_level: "Qualification", address: "Address",
  subject: "Subject", subject_interest: "Subject Interest", interests: "Hobbies & Interests", aim_of_life: "Aim Of Life",
  aadhaar_number: "Aadhaar Number", photo: "Photo", signature: "Signature", admin_note: "Admin Note",
};

/** STRE admin: candidate ki galti theek karne ka form. */
export default function StreEditRegistration({ reg, onSaved, onCancel }: { reg: Row; onSaved: (r: Row) => void; onCancel: () => void }) {
  const [v, setV] = useState<Record<string, string>>({
    first_name: reg.first_name ?? "", last_name: reg.last_name ?? "", email: reg.email ?? "", mobile: reg.mobile ?? "",
    father_name: reg.father_name ?? "", gender: reg.gender ?? "", caste_category: reg.caste_category ?? "", state_code: reg.state_code ?? "", school_name: reg.school_name ?? "", class_level: reg.class_level ?? "", address: reg.address ?? "", subject: reg.subject ?? "", subject_interest: reg.subject_interest ?? "",
    interests: (reg.interests ?? []).join(", "), aim_of_life: reg.aim_of_life ?? "", aadhaar_number: "", admin_note: reg.admin_note ?? "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [resend, setResend] = useState(reg.status === "admit_card_issued");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: string, value: string) => { setV((s) => ({ ...s, [k]: value })); setErrors((e) => (e[k] ? { ...e, [k]: "" } : e)); };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const e: Record<string, string> = {};
    for (const k of ["first_name", "last_name", "father_name"]) { const m = nameError(v[k]); if (m) e[k] = m; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = "Enter a valid email address.";
    if (!isValidPhone(v.mobile)) e.mobile = PHONE_HINT;
    if (v.subject.trim().length < 2) e.subject = "Enter the subject.";
    if (!v.class_level) e.class_level = "Select the qualification.";
    if (v.school_name.trim().length < 3) e.school_name = `Enter the ${streSchoolFieldLabel(v.class_level).toLowerCase()}.`;
    if (v.address.trim().length < 10) e.address = "Enter the full address.";
    if (!v.interests.split(",").some((i) => i.trim())) e.interests = "Enter at least one interest.";
    if (v.aim_of_life.trim().length < 5) e.aim_of_life = "Write a few words.";
    if (v.aadhaar_number && !/^\d{12}$/.test(v.aadhaar_number)) e.aadhaar_number = "Aadhaar number must have exactly 12 digits.";
    if (Object.keys(e).length) { setErrors(e); toast.error("Please correct the fields marked in red."); return; }

    const form = new FormData();
    for (const k of ["first_name", "last_name", "email", "mobile", "father_name", "gender", "caste_category", "state_code", "class_level", "school_name", "address", "subject", "subject_interest", "aim_of_life", "admin_note"]) form.append(k, v[k].trim());
    v.interests.split(",").map((i) => i.trim()).filter(Boolean).forEach((i) => form.append("interests", i));
    if (v.aadhaar_number) form.append("aadhaar_number", v.aadhaar_number);
    if (photo) form.append("photo", photo);
    if (signature) form.append("signature", signature);
    if (resend) form.append("resend_admit_card", "true");
    setBusy(true);
    try {
      const updated = await api<Row>(`/stre/admin/registrations/${reg.id}/`, { method: "PATCH", body: form, silent: true });
      const changed = (updated.changed_fields as string[] | undefined) ?? [];
      toast.success(changed.length ? `Saved: ${changed.map((c) => LABELS[c] ?? c).join(", ")}${updated.admit_card_resent ? ". Updated admit card emailed." : "."}` : "No changes to save.");
      onSaved(updated);
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      toast.error(Object.keys(fe).length ? `Please correct: ${Object.keys(fe).map((k) => LABELS[k] ?? k).join(", ")}.` : err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const input = (name: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, required = true) => (
    <label className={`block text-sm ${errors[name] ? "has-error" : ""}`}>
      <span className="mb-1 block font-medium text-slate-600">{LABELS[name]}{required && <span className="text-red-500"> *</span>}</span>
      <input className="input" value={v[name]} aria-invalid={errors[name] ? true : undefined} onChange={(e) => set(name, e.target.value)} {...extra} />
      {errors[name] && <span role="alert" className="field-error mt-1 block text-xs font-medium">{errors[name]}</span>}
    </label>
  );

  return (
    <form onSubmit={save} noValidate className="space-y-3">
      <p className="mandatory-note rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Correct the candidate&apos;s mistakes. Changes are saved in the audit log. <span className="font-bold text-red-500">*</span> = mandatory.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {input("first_name", { maxLength: 100 })}
        {input("last_name", { maxLength: 100 })}
        {input("email", { type: "email" })}
        <label className={`block text-sm ${errors.mobile ? "has-error" : ""}`}>
          <span className="mb-1 block font-medium text-slate-600">Mobile<span className="text-red-500"> *</span></span>
          <input className="input" type="tel" inputMode="tel" maxLength={14} value={v.mobile} onChange={(e) => set("mobile", cleanPhone(e.target.value))} />
          {errors.mobile && <span role="alert" className="field-error mt-1 block text-xs font-medium">{errors.mobile}</span>}
        </label>
        {input("father_name", { maxLength: 150 })}
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">Gender</span>
          <select className="input" value={v.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">Not provided</option>
            {STRE_GENDERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">Caste category</span>
          <select className="input" value={v.caste_category} onChange={(e) => set("caste_category", e.target.value)}>
            <option value="">Not provided</option>
            {STRE_CASTE_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">State</span>
          <select className="input" value={v.state_code} onChange={(e) => set("state_code", e.target.value)}>
            <option value="">Not provided</option>
            {STRE_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
          </select>
        </label>
        {input("subject", { maxLength: 100 })}
        <label className={`block text-sm ${errors.class_level ? "has-error" : ""}`}>
          <span className="mb-1 block font-medium text-slate-600">Qualification<span className="text-red-500"> *</span></span>
          <select className="input" value={v.class_level} onChange={(e) => set("class_level", e.target.value)}>
            <option value="">Select Qualification</option>
            {STRE_CLASS_LEVELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {errors.class_level && <span role="alert" className="field-error mt-1 block text-xs font-medium">{errors.class_level}</span>}
        </label>
        <label className={`block text-sm ${errors.school_name ? "has-error" : ""}`}>
          <span className="mb-1 block font-medium text-slate-600">{streSchoolFieldLabel(v.class_level)}<span className="text-red-500"> *</span></span>
          <input className="input" maxLength={200} value={v.school_name} onChange={(e) => set("school_name", e.target.value)} />
          {errors.school_name && <span role="alert" className="field-error mt-1 block text-xs font-medium">{errors.school_name}</span>}
        </label>
      </div>
      {input("address", { maxLength: 500 })}
      {input("subject_interest", { maxLength: 1000 }, false)}
      {input("interests", { maxLength: 600, placeholder: "Comma separated, e.g. Robotics, Chess" })}
      <label className={`block text-sm ${errors.aim_of_life ? "has-error" : ""}`}>
        <span className="mb-1 block font-medium text-slate-600">Aim of life<span className="text-red-500"> *</span></span>
        <textarea className="input" rows={2} maxLength={1000} value={v.aim_of_life} onChange={(e) => set("aim_of_life", e.target.value)} />
        {errors.aim_of_life && <span role="alert" className="field-error mt-1 block text-xs font-medium">{errors.aim_of_life}</span>}
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={`block text-sm ${errors.aadhaar_number ? "has-error" : ""}`}>
          <span className="mb-1 block font-medium text-slate-600">New Aadhaar</span>
          <input className="input font-mono" inputMode="numeric" maxLength={12} placeholder={reg.aadhaar_last4 ? `Current ••••${reg.aadhaar_last4}` : "12 digits"} value={v.aadhaar_number} onChange={(e) => set("aadhaar_number", e.target.value.replace(/\D/g, "").slice(0, 12))} />
          {errors.aadhaar_number ? <span role="alert" className="field-error mt-1 block text-xs font-medium">{errors.aadhaar_number}</span> : <span className="mt-1 block text-[11px] text-slate-400">Leave empty to keep</span>}
        </label>
        <label className={`block text-sm ${errors.photo ? "has-error" : ""}`}>
          <span className="mb-1 block font-medium text-slate-600">New photo</span>
          <input className="block w-full text-xs" type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (!file) { setPhoto(null); return; } shrinkPhoto(file).then((small) => { setPhoto(small); setErrors((x) => ({ ...x, photo: "" })); }).catch((err) => { setPhoto(null); setErrors((x) => ({ ...x, photo: imageErrorMessage(err) })); }); }} />
          {errors.photo && <span role="alert" className="field-error mt-1 block text-xs font-medium">{errors.photo}</span>}
        </label>
        <label className={`block text-sm ${errors.signature ? "has-error" : ""}`}>
          <span className="mb-1 block font-medium text-slate-600">New signature</span>
          <input className="block w-full text-xs" type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (!file) { setSignature(null); return; } shrinkSignature(file).then((small) => { setSignature(small); setErrors((x) => ({ ...x, signature: "" })); }).catch((err) => { setSignature(null); setErrors((x) => ({ ...x, signature: imageErrorMessage(err) })); }); }} />
          {errors.signature && <span role="alert" className="field-error mt-1 block text-xs font-medium">{errors.signature}</span>}
        </label>
      </div>
      {input("admin_note", { maxLength: 300, placeholder: "e.g. Name corrected on candidate's request" }, false)}
      {reg.status === "admit_card_issued" && (
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} />Email the updated admit card to the candidate</label>
      )}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={busy}>{busy ? <><Spinner className="mr-2" />Saving…</> : "Save changes"}</button>
      </div>
    </form>
  );
}
