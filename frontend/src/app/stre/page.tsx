"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { formatDate, STRE_CASTE_CATEGORIES, STRE_GENDERS, STRE_STATES, STRE_CLASS_LEVELS, STRE_COLLEGE_LEVELS, streCasteCategoryLabel, streClassLabel, streGenderLabel, streSchoolFieldLabel, streStateLabel, type StreExamSlot, type StrePaymentInfo, type StrePublicReg } from "@/lib/stre";
import { toast } from "@/lib/toast";
import { imageErrorMessage, shrinkPhoto, shrinkSignature } from "@/lib/image";
import { PHONE_HINT, cleanPhone, fieldErrors, isValidPhone, nameError } from "@/lib/validation";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import StrePayment from "@/components/StrePayment";
import StreShell from "@/components/StreShell";
import EmailOtpField from "@/components/EmailOtpField";
import StreOfflineForm from "@/components/StreOfflineForm";
import TurnstileWidget from "@/components/TurnstileWidget";
import StreCaptcha, { type CaptchaValue } from "@/components/StreCaptcha";

type Info = {
  exam: null | { title: string; code: string; exam_date: string; exam_time: string; last_date: string; fee: string; venue: string; instructions: string };
  slots: StreExamSlot[];
  subjects: string[];
  interest_options: string[];
  payment: StrePaymentInfo;
};

const OTHER = "__other__";
const CAPITALIZED_FIELDS = new Set([
  "first_name", "last_name", "father_name", "school_name", "address",
  "subject", "subject_interest", "aim_of_life",
]);
const LABELS: Record<string, string> = {
  first_name: "First Name", last_name: "Last Name", email: "Email", mobile: "Mobile Number", father_name: "Father's Name", gender: "Gender", caste_category: "Caste Category", state_code: "State", school_name: "School / College Name", class_level: "Qualification", address: "Address",
  subject: "Subject", subject_interest: "Subject Interest", interests: "Hobbies & Interests", aim_of_life: "Aim Of Life", slot: "Exam Slot",
  aadhaar_number: "Aadhaar Number", photo: "Photo", signature: "Signature",
};

function Req() { return <span className="text-red-500" aria-hidden="true"> *</span>; }
function Err({ msg }: { msg?: string }) { return msg ? <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{msg}</span> : null; }

function capitalizeInitials(value: string) {
  let capitalizeNext = true;
  let result = "";
  for (const char of value) {
    const isLetter = char.toLowerCase() !== char.toUpperCase();
    result += capitalizeNext && isLetter ? char.toUpperCase() : char;
    if (capitalizeNext && isLetter) capitalizeNext = false;
    if (/\s|[-'’]/u.test(char)) capitalizeNext = true;
  }
  return result;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

async function fileToDataUrl(file: File | null) {
  if (!file) return "";
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function printStreOfflineForm(
  exam: Info["exam"],
  values: Record<string, string> = {},
  interests: string[] = [],
  result?: StrePublicReg,
  files: { photo: File | null; signature: File | null } = { photo: null, signature: null },
) {
  if (!exam) return;
  const v = (label: string, fallback = "") => escapeHtml(values[label]?.trim() || fallback);
  const fee = Number(exam.fee) > 0 ? `Rs. ${Number(exam.fee).toLocaleString("en-IN")}` : "Free";
  const confirmation = !!result;
  const photoDataUrl = await fileToDataUrl(files.photo);
  const field = (label: string, value: string, wide = false) =>
    `<div class="field${wide ? " wide" : ""}"><span>${escapeHtml(label)}</span><b>${value || "&nbsp;"}</b></div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>STRE Offline Registration Form</title><style>
    @page { size:A4 portrait; margin:0 }
    html, body { print-color-adjust:exact; -webkit-print-color-adjust:exact }
    * { box-sizing:border-box }
    html,body { width:210mm; height:297mm; margin:0; overflow:hidden; background:#fff; font-family:Georgia,'Times New Roman',serif; color:#1c1917 }
    .sheet { position:relative; width:200mm; height:287mm; margin:5mm auto; border:1.5px solid #4338ca; background:#fff; overflow:hidden }
    .sheet::before { content:""; position:absolute; inset:2.6mm; border:1px solid #c7d2fe; pointer-events:none; z-index:0 }
    header { position:relative; z-index:1; margin:0; display:flex; align-items:center; gap:4mm; border-top:2mm solid #4338ca; border-image:linear-gradient(90deg,#312e81,#4f46e5 45%,#0ea5e9) 1; border-bottom:2px solid #4338ca; padding:3mm 8mm 3.5mm; font-family:Arial,sans-serif; background:#ede9fe; background:linear-gradient(120deg,#ede9fe,#e0e7ff 60%,#dbeafe) }
    header .crest { display:flex; height:13mm; width:13mm; flex:none; align-items:center; justify-content:center; border-radius:50%; background:#4338ca; background:linear-gradient(135deg,#4f46e5,#4338ca); font-family:Georgia,serif; font-size:14pt; font-weight:bold; color:#fff; box-shadow:0 0 0 1.5px #4338ca }
    header .title-block { flex:1; text-align:center }
    header p { margin:0 0 1mm; color:#4338ca; font-size:7.5pt; font-weight:bold; letter-spacing:.2em; text-transform:uppercase }
    header h1 { margin:0; color:#1e1b4b; font-size:16pt; letter-spacing:.01em }
    header span { display:block; margin-top:1mm; color:#6d28d9; font-size:8.5pt; font-style:italic; font-weight:bold }
    header .regno { flex:none; min-width:28mm; border:1.5px solid #4338ca; padding:1.5mm 2.5mm; text-align:center; font-family:Arial,sans-serif }
    header .regno em { display:block; font-style:normal; color:#7c3aed; font-size:6.5pt; font-weight:bold; letter-spacing:.1em; text-transform:uppercase }
    header .regno b { display:block; margin-top:.8mm; font-size:9pt; color:#1e1b4b }
    .body { position:relative; z-index:1; padding:4mm 8mm 0; font-family:Arial,sans-serif }
    .note { margin:0 0 3mm; border:1px dashed #d97706; background:#fffbeb; color:#92400e; padding:2mm 3mm; font-size:8pt; font-style:italic; border-left:3px solid #f59e0b }
    .confirmation { display:grid; grid-template-columns:repeat(3,1fr); gap:0; margin:0 0 3mm; border:1.5px solid #4338ca; border-radius:2mm; overflow:hidden }
    .confirmation div { border-right:1px solid #c7d2fe; background:#f5f3ff; padding:2mm 3mm; text-align:center }
    .confirmation div:last-child { border-right:0 }
    .confirmation span,.field span { display:block; color:#7c3aed; font-size:6.8pt; font-weight:bold; letter-spacing:.06em; text-transform:uppercase }
    .confirmation b { display:block; font-size:10pt; margin-top:.8mm; color:#1e1b4b }
    section { margin-top:2.6mm }
    h2 { display:flex; align-items:center; gap:2mm; margin:0 0 1.6mm; color:#fff; font-size:9pt; font-weight:bold; letter-spacing:.03em; text-transform:uppercase; background:#4338ca; background:linear-gradient(90deg,#4338ca,#6366f1); padding:1.1mm 3mm; border-radius:1.5mm }
    h2 .num { display:flex; height:5mm; width:5mm; flex:none; align-items:center; justify-content:center; border-radius:50%; background:#fff; color:#4338ca; font-size:7.5pt; font-weight:bold }
    h2::after { content:""; flex:1 }
    .grid { display:grid; grid-template-columns:repeat(2,1fr); gap:0 6mm }
    .field { min-height:8.5mm; border-bottom:1.5px solid #a5b4fc; padding:0 0 1mm; margin-bottom:2.5mm }
    .field.wide { grid-column:1/-1 }
    .field span { color:#7c3aed }
    .field b { display:block; min-height:4mm; margin-top:1.5mm; font-size:9pt; font-weight:normal; color:#1c1917 }
    .student-details { position:relative }
    .photo-slot { position:absolute; top:11mm; right:0; width:28mm; height:35mm; border:1.5px solid #4338ca; background:#f5f3ff; text-align:center }
    .photo-slot img { width:100%; height:100%; object-fit:cover }
    .photo-slot span { display:block; margin-top:1mm; color:#7c3aed; font-size:6.5pt; font-weight:bold; letter-spacing:.04em; text-transform:uppercase }
    .student-details .grid { padding-right:32mm }
    .declaration { margin-top:3mm; border:0; border-top:1.5px solid #c7d2fe; background:transparent; padding:2.5mm 0 0 }
    .declaration h3 { margin:0 0 1mm; color:#4338ca; font-size:8pt; font-weight:bold; text-transform:uppercase; letter-spacing:.04em }
    .declaration p { margin:0; color:#44403c; font-size:7.3pt; line-height:1.3; font-style:italic }
    .checklist { display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; margin-top:2mm }
    .checklist div { border:0; background:transparent; padding:0; color:#44403c; font-size:7.3pt }
    .checklist b { display:inline-block; width:3mm; height:3mm; margin-right:1.5mm; border:1.5px solid #4338ca; vertical-align:-0.5mm; font-weight:normal }
    .verification { display:grid; grid-template-columns:repeat(3,1fr); gap:0; margin-top:4mm; border:1.5px solid #4338ca; border-radius:2mm; overflow:hidden }
    .verification div { min-height:15mm; border-right:1px solid #c7d2fe; background:#faf9ff; padding:2mm 3mm }
    .verification div:last-child { border-right:0 }
    .verification span { display:block; color:#7c3aed; font-size:6.8pt; font-weight:bold; letter-spacing:.06em; text-transform:uppercase }
    .verification b { display:block; margin-top:1.5mm; color:#1e1b4b; font-size:8pt; font-weight:normal; line-height:1.25 }
    footer { display:grid; grid-template-columns:repeat(2,1fr); gap:12mm; margin:5mm 0 0 }
    footer div { height:9mm; border-top:1.5px solid #4338ca }
    footer span { display:block; margin-top:1.5mm; text-align:center; color:#44403c; font-size:7.5pt; font-weight:bold; letter-spacing:.03em; text-transform:uppercase }
    .foot-note { position:absolute; bottom:4mm; left:8mm; right:8mm; z-index:1; display:flex; justify-content:space-between; border-top:1px solid #d6d3d1; padding-top:1.5mm; font-family:Arial,sans-serif; color:#a8a29e; font-size:6.5pt; letter-spacing:.03em }
  </style></head><body><article class="sheet"><header><span class="crest">O</span><div class="title-block"><p>Student Talent Recognition Exam</p><h1>${confirmation ? "Registration Acknowledgement" : "Offline Registration Form"}</h1><span>${escapeHtml(exam.title)} &middot; ${escapeHtml(exam.code)}</span></div><div class="regno"><em>${confirmation ? "Registration no." : "Application ID"}</em><b>${confirmation ? escapeHtml(result.registration_no) : "To be generated"}</b></div></header><div class="body">
  ${confirmation ? `<div class="confirmation"><div><span>Registration number</span><b>${escapeHtml(result.registration_no)}</b></div><div><span>Status</span><b>${escapeHtml(result.status_label)}</b></div><div><span>Roll number</span><b>${escapeHtml(result.roll_no || "To be issued")}</b></div></div>` : `<p class="note">Please fill in block letters. This sheet can be printed and kept for your records. Submit the online form to complete registration.</p>`}
  <section class="student-details"><h2><span class="num">1</span>Student Details</h2><div class="grid">
    ${field("First Name", confirmation ? escapeHtml(result.full_name) : v("first_name"), !confirmation)}
    ${!confirmation ? field("Last Name", v("last_name")) : ""}
    ${field("Father's Name", confirmation ? "" : v("father_name"))}
    ${field("Gender", streGenderLabel(v("gender")))}
    ${field("Caste Category", streCasteCategoryLabel(v("caste_category")))}
    ${field("State", streStateLabel(v("state_code")))}
    ${field("Qualification", confirmation ? "" : escapeHtml(streClassLabel(values.class_level)))}
    ${field(streSchoolFieldLabel(values.class_level), confirmation ? "" : v("school_name"), true)}
    ${field("Mobile Number", confirmation ? escapeHtml(result.mobile) : v("mobile"))}
    ${field("Email", confirmation ? escapeHtml(result.email) : v("email"))}
    ${field("Aadhaar Number", confirmation ? "" : v("aadhaar_number"))}
    ${field("Subject", confirmation ? escapeHtml(result.subject) : v("subject"))}
    ${field("Address", confirmation ? "" : v("address"), true)}
  </div><div class="photo-slot">${photoDataUrl ? `<img src="${photoDataUrl}" alt="Candidate photo">` : ""}<span>Passport-size photo</span></div></section>
  ${confirmation ? "" : `<section><h2><span class="num">2</span>Interests & Goals</h2><div class="grid">${field("Hobbies & Interests", escapeHtml(interests.join(", ")), true)}${field("Subject Interest", v("subject_interest"), true)}${field("Aim Of Life", v("aim_of_life"), true)}</div></section>`}
  <section><h2><span class="num">${confirmation ? "2" : "3"}</span>Exam Details</h2><div class="grid">${field("Exam Date (Tentative)", escapeHtml(formatDate(exam.exam_date)))}${field("Reporting / Exam Time", escapeHtml(exam.exam_time || "To Be Announced"))}${field("Registration Closes", escapeHtml(formatDate(exam.last_date)))}${field("Registration Fee", fee)}${field("Venue", escapeHtml(exam.venue || "To Be Announced"), true)}</div></section>
  <section class="declaration"><h3>Candidate declaration</h3><p>I declare that the information provided is true and complete. I agree to follow the examination rules and will bring the required identity proof and admit card to the examination centre.</p><div class="checklist"><div><b></b>Photo attached</div><div><b></b>Details verified</div><div><b></b>Fee / rules accepted</div></div></section>
  <div class="verification"><div><span>Application ID</span><b>${confirmation ? escapeHtml(result.registration_no) : "To be generated"}</b></div><div><span>Exam centre</span><b>${escapeHtml(exam.venue || "To be announced")}</b></div><div><span>Office stamp</span><b></b></div></div>
  <footer><div><span>Student signature</span></div><div><span>Parent / guardian signature</span></div></footer>
  </div><div class="foot-note"><span>Oshitech Education ERP &middot; Student Talent Recognition Exam</span><span>Generated ${escapeHtml(new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))}</span></div></article></body></html>`;

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    toast.error("Could not open the print form.");
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
}



export default function StreRegisterPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState("");
  const [v, setV] = useState<Record<string, string>>({});
  const [interests, setInterests] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState("");
  const [showCustomSkill, setShowCustomSkill] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ photo?: string; signature?: string }>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<StrePublicReg | null>(null);
  const [emailToken, setEmailToken] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaValue>({ captcha_id: "", captcha: "" });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);

  useEffect(() => {
    api<Info>("/stre/public/").then(setInfo).catch(() => setLoadError("Could not load exam details. Check your connection and refresh."));
  }, []);
  useEffect(() => () => { Object.values(preview).forEach((url) => url && URL.revokeObjectURL(url)); }, [preview]);

  const set = (k: string, value: string) => {
    const formatted = CAPITALIZED_FIELDS.has(k) ? capitalizeInitials(value) : value;
    setV((s) => ({ ...s, [k]: formatted }));
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
  };
  const subject = v.subject ?? "";

  const pickFile = async (kind: "photo" | "signature", file: File | null) => {
    setErrors((e) => ({ ...e, [kind]: "" }));
    if (!file) return;
    try {
      // Kitni bhi MB ki photo ho: browser me hi chhoti karke upload
      const small = await (kind === "photo" ? shrinkPhoto(file) : shrinkSignature(file));
      (kind === "photo" ? setPhoto : setSignature)(small);
      setPreview((p) => ({ ...p, [kind]: URL.createObjectURL(small) }));
    } catch (err) {
      setErrors((e) => ({ ...e, [kind]: imageErrorMessage(err) }));
    }
  };

  const toggleInterest = (item: string) => {
    setErrors((e) => ({ ...e, interests: "" }));
    setInterests((list) => (list.includes(item) ? list.filter((i) => i !== item) : [...list, item]));
  };
  const addSkill = () => {
    const skill = capitalizeInitials(customSkill.trim().replace(/\s+/g, " "));
    if (skill.length < 2) return;
    if (!interests.some((i) => i.toLowerCase() === skill.toLowerCase())) setInterests((list) => [...list, skill]);
    setCustomSkill("");
    setShowCustomSkill(false);
    setErrors((e) => ({ ...e, interests: "" }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    for (const k of ["first_name", "last_name", "father_name"]) { const m = nameError(v[k] ?? ""); if (m) e[k] = m; }
    if (!v.class_level) e.class_level = "Select your class or qualification.";
    if (!v.gender) e.gender = "Select your gender.";
    if (!v.caste_category) e.caste_category = "Select your caste category.";
    if (!v.state_code) e.state_code = "Select your state or union territory.";
    if ((v.school_name ?? "").trim().length < 3) e.school_name = `Enter your ${streSchoolFieldLabel(v.class_level).toLowerCase()}.`;
    if ((v.address ?? "").trim().length < 10) e.address = "Enter your full address (house, area, city, PIN code).";
    if (!v.email) e.email = "This field is required.";
    else if (!emailToken) e.email = "Please verify your email with the OTP (tap “Verify email”).";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = "Enter a valid email address, e.g. name@example.com.";
    if (!v.mobile) e.mobile = "This field is required."; else if (!isValidPhone(v.mobile)) e.mobile = PHONE_HINT;
    if (info?.slots.length && !v.slot) e.slot = "Select an exam slot.";
    if (subject.trim().length < 2) e.subject = "Type your subject, e.g. Mathematics.";
    if (!interests.length) e.interests = "Choose at least one interest or add your own skill.";
    if ((v.aim_of_life ?? "").trim().length < 5) e.aim_of_life = "Please write a few words about your aim in life.";
    if (!/^\d{12}$/.test(v.aadhaar_number ?? "")) e.aadhaar_number = "Aadhaar number must have exactly 12 digits.";
    if (!photo) e.photo = "Upload your photo.";
    if (!signature) e.signature = "Upload your signature.";
    if (captcha.captcha.length !== 5) e.captcha = "Type the 5 characters shown in the image.";
    else if (!turnstileToken) e.captcha = "Please complete the verification check.";
    return e;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      toast.error(`Please correct: ${Object.keys(e).map((k) => LABELS[k] ?? k).join(", ")}.`);
      document.getElementById(`stre-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    const form = new FormData();
    for (const k of ["first_name", "last_name", "email", "mobile", "father_name", "gender", "caste_category", "state_code", "class_level", "school_name", "address", "subject_interest", "aim_of_life", "aadhaar_number"]) form.append(k, (v[k] ?? "").trim());
    form.append("subject", subject.trim());
    if (v.slot) form.append("slot", v.slot);
    interests.forEach((i) => form.append("interests", i));
    form.append("email_token", emailToken);
    form.append("captcha_id", captcha.captcha_id);
    form.append("captcha", captcha.captcha);
    form.append("turnstile_token", turnstileToken);
    form.append("photo", photo as File);
    form.append("signature", signature as File);
    try {
      const reg = await api<StrePublicReg>("/stre/register/", { method: "POST", body: form, silent: true });
      setDone(reg);
      toast.success(`Registered! Your registration number is ${reg.registration_no}.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const fe = fieldErrors(err);
      if (fe.email) setEmailToken("");
      setErrors(fe);
      const keys = Object.keys(fe);
      toast.error(keys.length ? `Please correct: ${keys.map((k) => LABELS[k] ?? k).join(", ")}.` : err instanceof ApiError ? err.message : "Registration failed. Try again.");
    } finally {
      setBusy(false);
      setTurnstileToken("");
      setTurnstileKey((k) => k + 1);
    }
  };

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint = "") => (
    <label className={`block text-xs font-semibold text-slate-800 ${errors[name] ? "has-error" : ""}`}>
      {label}<Req />
      <input id={`stre-${name}`} name={name} className="input mt-1.5" value={v[name] ?? ""} aria-invalid={errors[name] ? true : undefined} onChange={(e) => set(name, e.target.value)} {...props} />
      {hint && !errors[name] && <span className="mt-1 block text-[11px] font-normal text-slate-500">{hint}</span>}
      <Err msg={errors[name]} />
    </label>
  );

  if (done) {
    return (
      <StreShell notices={false}>
        <section className="stre-registration-page font-sans overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
          {done.status === "payment_pending" || done.status === "payment_submitted" ? (
            <div className="stre-hero bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-6 text-white sm:px-8">
              <Icon name="wallet" size={28} />
              <h1 className="mt-2 text-2xl font-semibold">One step left — pay the fee to confirm</h1>
              <p className="mt-1 text-sm text-amber-50">Your registration is <b>not confirmed</b> until the fee is paid. A payment confirmation and roll number are assigned after successful payment.</p>
            </div>
          ) : (
            <div className="stre-hero bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-6 text-white sm:px-8">
              <Icon name="check" size={28} />
              <h1 className="mt-2 text-2xl font-semibold">Registration confirmed</h1>
              <p className="mt-1 text-sm text-emerald-50">Payment received. The admit card will be available after it is issued by the exam cell.</p>
            </div>
          )}
          <div className="space-y-4 p-5 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Registration number</p><p className="mt-1 select-all font-mono text-lg font-bold text-slate-900">{done.registration_no}</p></div>
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</p><p className="mt-1 text-sm font-semibold text-slate-900">{done.status_label}</p></div>
              {done.slot_label && <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Exam slot</p><p className="mt-1 text-sm font-semibold text-slate-900">{done.slot_label}{done.slot_time ? ` — ${done.slot_time}` : ""}</p></div>}
            </div>
            {info && <StrePayment reg={done} payment={info.payment} onUpdate={setDone} autoStart />}
            {done.status === "paid" && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Payment received — your registration is confirmed{done.roll_no ? ` (Roll no. ${done.roll_no})` : ""}. The admit card will be available after the exam cell issues it.</p>}
            {done.status === "admit_card_issued" && <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><b className="block">Your admit card is ready — Roll no. {done.roll_no}</b><span className="block">The exam cell has issued it.</span><a href={`/api/v1/stre/admit-card/${encodeURIComponent(done.access_token)}/download/`} className="btn-primary mt-3 flex w-full sm:inline-flex sm:w-auto">Download admit card</a></div>}
            <p className="text-xs leading-5 text-slate-500">Keep your registration number safe. You can check your status, pay the fee later and download your admit card any time using your registration number and mobile number.</p>
            <div className="flex flex-wrap gap-3">
              <Link href={`/stre/status?token=${done.access_token}`} className="btn-primary">Open my status page</Link>
              {info?.exam && <button type="button" className="btn-ghost" onClick={() => void printStreOfflineForm(info.exam, v, interests, done)}><Icon name="printer" size={16} className="mr-2" />Download / Print PDF</button>}
            </div>
          </div>
          {info?.exam && <StreOfflineForm exam={info.exam} result={done} values={v} interests={interests} />}
        </section>
      </StreShell>
    );
  }

  return (
    <StreShell notices={false}>
      <section className="stre-registration-page font-sans overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
        <header className="bg-gradient-to-r from-[#3b1d6e] to-[#4f46e5] px-5 py-6 font-sans text-white sm:px-8 sm:py-8">
          <div className="stre-registration-header-controls flex items-stretch gap-2 sm:items-center sm:justify-between">
            <span className="inline-flex min-w-0 items-center justify-center gap-1 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-center text-[9px] font-semibold uppercase leading-tight tracking-[.08em] sm:gap-2 sm:px-3 sm:text-[10px] sm:tracking-[.16em]"><Icon name="award" size={13} className="shrink-0" />Exam registration only</span>
            {info?.exam && (
              <button type="button" className="no-print inline-flex min-w-0 items-center justify-center gap-1 rounded-md border border-white/25 bg-white/10 px-2 py-2 text-center font-sans text-xs font-medium leading-tight tracking-normal text-white transition hover:bg-white/20 sm:gap-0 sm:px-3 sm:text-sm" onClick={() => void printStreOfflineForm(info.exam, v, interests, undefined, { photo, signature })}><Icon name="download" size={15} className="shrink-0 sm:mr-1.5" />Download offline form</button>
            )}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">STRE Student Talent Recognition Exam</h1>
          <p className="mt-2 text-sm leading-6 text-indigo-100">This registration is only for the talent exam. It does not create a school portal account.</p>
          {info?.exam && (
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {[["Exam date (tentative)", formatDate(info.exam.exam_date)], ["Registration closes", formatDate(info.exam.last_date)], ["Fee", Number(info.exam.fee) > 0 ? `₹${Number(info.exam.fee).toLocaleString("en-IN")}` : "Free"], ["Time", info.exam.exam_time || "To be announced"]].map(([k, val]) => (
                <div key={k} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2"><span className="block text-[10px] uppercase tracking-wider text-indigo-200">{k}</span><b className="mt-0.5 block">{val}</b></div>
              ))}
            </div>
          )}
        </header>

        {loadError && <p className="m-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{loadError}</p>}
        {!info && !loadError && <p className="p-6 text-sm text-slate-500"><Spinner className="mr-2" />Loading…</p>}
        {info && !info.exam && <p className="m-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Registration is closed right now. Please check back later for the next exam.</p>}

        {info?.exam && (
          <form onSubmit={submit} noValidate className="space-y-7 p-5 sm:p-8">
            <p className="mandatory-note flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600"><span className="text-base font-bold leading-4 text-red-500">*</span><span>Fields Marked With A Red Star Are Mandatory.</span></p>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-xs text-indigo-700">01</span>Student Details</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {field("first_name", "First Name", { autoComplete: "given-name", maxLength: 100 })}
                {field("last_name", "Last Name", { autoComplete: "family-name", maxLength: 100 })}
                <div className="sm:col-span-2"><EmailOtpField value={v.email ?? ""} onChange={(email) => { set("email", email); if (emailToken) setEmailToken(""); }} token={emailToken} onToken={(t) => { setEmailToken(t); setErrors((x) => ({ ...x, email: "" })); }} error={errors.email} /></div>
                <label className={`block text-xs font-semibold text-slate-800 ${errors.mobile ? "has-error" : ""}`}>Mobile Number<Req />
                  <input id="stre-mobile" name="mobile" className="input mt-1.5" type="tel" inputMode="tel" maxLength={14} placeholder="9876543210" value={v.mobile ?? ""} aria-invalid={errors.mobile ? true : undefined} onChange={(e) => set("mobile", cleanPhone(e.target.value))} />
                  {!errors.mobile && <span className="mt-1 block text-[11px] font-normal text-slate-500">10-Digit Mobile Number</span>}
                  <Err msg={errors.mobile} />
                </label>
                {field("father_name", "Father's Name", { maxLength: 150 })}
                <label className={`block text-xs font-semibold text-slate-800 ${errors.gender ? "has-error" : ""}`}>Gender<Req />
                  <select id="stre-gender" name="gender" className="input mt-1.5" value={v.gender ?? ""} aria-invalid={errors.gender ? true : undefined} onChange={(e) => set("gender", e.target.value)}>
                    <option value="">Select Gender</option>
                    {STRE_GENDERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <Err msg={errors.gender} />
                </label>
                <label className={`block text-xs font-semibold text-slate-800 ${errors.caste_category ? "has-error" : ""}`}>Caste Category<Req />
                  <select id="stre-caste_category" name="caste_category" className="input mt-1.5" value={v.caste_category ?? ""} aria-invalid={errors.caste_category ? true : undefined} onChange={(e) => set("caste_category", e.target.value)}>
                    <option value="">Select Category</option>
                    {STRE_CASTE_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <Err msg={errors.caste_category} />
                </label>
                <label className={`block text-xs font-semibold text-slate-800 ${errors.state_code ? "has-error" : ""}`}>State<Req />
                  <select id="stre-state_code" name="state_code" className="input mt-1.5" value={v.state_code ?? ""} aria-invalid={errors.state_code ? true : undefined} onChange={(e) => set("state_code", e.target.value)}>
                    <option value="">Select State</option>
                    {STRE_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
                  </select>
                  <Err msg={errors.state_code} />
                </label>
                <label className={`block text-xs font-semibold text-slate-800 ${errors.class_level ? "has-error" : ""}`}>Qualification<span className="text-red-500" aria-hidden="true"> *</span>
                  <select id="stre-class_level" name="class_level" className="input mt-1.5" value={v.class_level ?? ""} aria-invalid={errors.class_level ? true : undefined} onChange={(e) => set("class_level", e.target.value)}>
                    <option value="">Select Qualification</option>
                    {STRE_CLASS_LEVELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  {errors.class_level && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors.class_level}</span>}
                </label>
                {info.slots.length > 0 && (
                  <label className={`block text-xs font-semibold text-slate-800 ${errors.slot ? "has-error" : ""}`}>Exam Slot<Req />
                    <select id="stre-slot" name="slot" className="input mt-1.5" value={v.slot ?? ""} aria-invalid={errors.slot ? true : undefined} onChange={(e) => set("slot", e.target.value)}>
                      <option value="">Select Slot</option>
                      {info.slots.map((s) => <option key={s.id} value={s.id}>{s.label}{s.slot_time ? ` — ${s.slot_time}` : ""}</option>)}
                    </select>
                    {errors.slot && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors.slot}</span>}
                  </label>
                )}
                <label className={`block text-xs font-semibold text-slate-800 ${errors.school_name ? "has-error" : ""}`}>{streSchoolFieldLabel(v.class_level)}<Req />
                  <input id="stre-school_name" name="school_name" className="input mt-1.5" maxLength={200} placeholder={STRE_COLLEGE_LEVELS.has(v.class_level ?? "") ? "E.g. Banaras Hindu University, Varanasi" : "E.g. Kendriya Vidyalaya BHU, Varanasi"} value={v.school_name ?? ""} aria-invalid={errors.school_name ? true : undefined} onChange={(e) => set("school_name", e.target.value)} />
                  <Err msg={errors.school_name} />
                </label>
                <label className={`block text-xs font-semibold text-slate-800 sm:col-span-2 ${errors.address ? "has-error" : ""}`}>Address<span className="text-red-500" aria-hidden="true"> *</span>
                  <textarea id="stre-address" name="address" className="input mt-1.5" rows={2} maxLength={500} autoComplete="street-address" placeholder="House No., Street, Area, City, District, PIN Code" value={v.address ?? ""} aria-invalid={errors.address ? true : undefined} onChange={(e) => set("address", e.target.value)} />
                  {errors.address && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors.address}</span>}
                </label>
                <label className={`block text-xs font-semibold text-slate-800 ${errors.subject ? "has-error" : ""}`}>Subject<Req />
                  <input id="stre-subject" className="input mt-1.5" maxLength={100} placeholder="Type Your Subject, E.g. Mathematics" autoComplete="off" value={v.subject ?? ""} aria-invalid={errors.subject ? true : undefined} onChange={(e) => set("subject", e.target.value)} />
                  <Err msg={errors.subject} />
                </label>
              </div>
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-xs text-indigo-700">02</span>Interests & Goals</h2>
              <div className="grid gap-4">
                <label className="block text-xs font-semibold text-slate-800">Subject Interest <span className="font-normal text-slate-400">(Optional)</span>
                  <input id="stre-subject_interest" className="input mt-1.5" maxLength={1000} placeholder="E.g. Algebra, Physics Experiments" value={v.subject_interest ?? ""} onChange={(e) => set("subject_interest", e.target.value)} />
                </label>
                <div className={`block text-xs font-semibold text-slate-800 ${errors.interests ? "has-error" : ""}`}>
                  <label htmlFor="stre-interests">Hobbies & Interests<Req /> <span className="font-normal text-slate-500">— Select One Or More</span></label>
                  <select
                    id="stre-interests"
                    className="input mt-1.5"
                    value=""
                    aria-invalid={errors.interests ? true : undefined}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === OTHER) { setShowCustomSkill(true); return; }
                      if (value && !interests.includes(value)) { setInterests((list) => [...list, value]); setErrors((x) => ({ ...x, interests: "" })); }
                    }}
                  >
                    <option value="">{interests.length ? "Select Another Interest" : "Select Interest"}</option>
                    {info.interest_options.filter((o) => !interests.includes(o)).map((o) => <option key={o} value={o}>{o}</option>)}
                    <option value={OTHER}>Other — Add My Own Skill</option>
                  </select>
                  {showCustomSkill && (
                    <div className="mt-2 flex gap-2">
                      <input className="input" autoFocus maxLength={60} placeholder="Type Your Skill / Hobby (E.g. Chess)" value={customSkill} onChange={(e) => setCustomSkill(capitalizeInitials(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }} />
                      <button type="button" className="btn-ghost shrink-0" onClick={addSkill} disabled={customSkill.trim().length < 2}>+ Add</button>
                    </div>
                  )}
                  {interests.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2" aria-label="Selected interests">
                      {interests.map((item) => (
                        <span key={item} className="stre-chip is-on">
                          {item}
                          <button type="button" className="-mr-1 grid h-5 w-5 place-items-center rounded-full hover:bg-indigo-200/60" aria-label={`Remove ${item}`} onClick={() => toggleInterest(item)}><Icon name="close" size={11} strokeWidth={2.6} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <Err msg={errors.interests} />
                </div>
                <label className={`block text-xs font-semibold text-slate-800 ${errors.aim_of_life ? "has-error" : ""}`}>Aim Of Life<Req />
                  <textarea id="stre-aim_of_life" className="input mt-1.5" rows={3} maxLength={1000} placeholder="What Do You Want To Become, And Why?" value={v.aim_of_life ?? ""} aria-invalid={errors.aim_of_life ? true : undefined} onChange={(e) => set("aim_of_life", e.target.value)} />
                  <Err msg={errors.aim_of_life} />
                </label>
              </div>
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-xs text-indigo-700">03</span>Documents</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={`block text-xs font-semibold text-slate-800 sm:col-span-2 ${errors.aadhaar_number ? "has-error" : ""}`}>Student Aadhaar Number<Req />
                  <input id="stre-aadhaar_number" className="input mt-1.5 font-mono tracking-wider" inputMode="numeric" autoComplete="off" maxLength={12} placeholder="12-Digit Aadhaar Number" value={v.aadhaar_number ?? ""} aria-invalid={errors.aadhaar_number ? true : undefined} onChange={(e) => set("aadhaar_number", e.target.value.replace(/\D/g, "").slice(0, 12))} />
                  {!errors.aadhaar_number && <span className="mt-1 block text-[11px] font-normal text-slate-500">Stored Encrypted. Only The Last 4 Digits Appear On The Admit Card.</span>}
                  <Err msg={errors.aadhaar_number} />
                </label>
                {(["photo", "signature"] as const).map((kind) => (
                  <label key={kind} className={`stre-upload block text-xs font-semibold text-slate-800 ${errors[kind] ? "has-error" : ""}`}>{kind === "photo" ? "Passport-size photo" : "Signature"}<Req />
                    <span className="mt-1.5 flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3">
                      <span className={`grid shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400 ${kind === "photo" ? "h-20 w-16" : "h-12 w-28"}`}>
                        {preview[kind] ? <img src={preview[kind]} alt="" className="h-full w-full object-contain" /> : <Icon name={kind === "photo" ? "student" : "layers"} size={20} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <input id={`stre-${kind}`} type="file" accept="image/*" className="block w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700" onChange={(e) => void pickFile(kind, e.target.files?.[0] ?? null)} />
                        <span className="mt-1 block text-[11px] font-normal text-slate-500">{kind === "photo" ? "Any size photo, clear face it is resized automatically" : "Sign on white paper and take a photo any size works"}</span>
                      </span>
                    </span>
                    <Err msg={errors[kind]} />
                  </label>
                ))}
              </div>
            </section>

            <div className="space-y-3">
              <StreCaptcha value={captcha} onChange={(c) => { setCaptcha(c); setErrors((x) => ({ ...x, captcha: "" })); }} reloadKey={turnstileKey} />
              <TurnstileWidget token={turnstileToken} onChange={(t) => { setTurnstileToken(t); setErrors((x) => ({ ...x, captcha: "" })); }} reloadKey={turnstileKey} error={errors.captcha} />
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] leading-5 text-slate-500">By submitting, you confirm the details are correct. {Number(info.exam.fee) > 0 ? `A fee of ₹${Number(info.exam.fee).toLocaleString("en-IN")} is payable after registration.` : ""}</p>
              <button className="btn-primary w-full !py-3 sm:w-auto" disabled={busy}>{busy ? <><Spinner className="mr-2" />Submitting…</> : "Register for STRE"}</button>
            </div>
          </form>
        )}
        <StreOfflineForm exam={info?.exam ?? { title: "", code: "", exam_date: "", exam_time: "", last_date: "", fee: "0", venue: "", instructions: "" }} values={v} interests={interests} />
      </section>
    </StreShell>
  );
}
