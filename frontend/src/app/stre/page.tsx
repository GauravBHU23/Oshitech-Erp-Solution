"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { formatDate, type StrePaymentInfo, type StrePublicReg } from "@/lib/stre";
import { toast } from "@/lib/toast";
import { imageErrorMessage, shrinkPhoto, shrinkSignature } from "@/lib/image";
import { PHONE_HINT, cleanPhone, fieldErrors, isValidPhone, nameError } from "@/lib/validation";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import StrePayment from "@/components/StrePayment";
import StreShell from "@/components/StreShell";
import EmailOtpField from "@/components/EmailOtpField";

type Info = {
  exam: null | { title: string; code: string; exam_date: string; exam_time: string; last_date: string; fee: string; venue: string; instructions: string };
  subjects: string[];
  interest_options: string[];
  payment: StrePaymentInfo;
};

const OTHER = "__other__";
const LABELS: Record<string, string> = {
  first_name: "First name", last_name: "Last name", email: "Email", mobile: "Mobile number", father_name: "Father's name", school_name: "School name", class_level: "Class", address: "Address",
  subject: "Subject", subject_interest: "Subject interest", interests: "Hobbies & interests", aim_of_life: "Aim of life",
  aadhaar_number: "Aadhaar number", photo: "Photo", signature: "Signature",
};

function Req() { return <span className="text-red-500" aria-hidden="true"> *</span>; }
function Err({ msg }: { msg?: string }) { return msg ? <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{msg}</span> : null; }



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

  useEffect(() => {
    api<Info>("/stre/public/").then(setInfo).catch(() => setLoadError("Could not load exam details. Check your connection and refresh."));
  }, []);
  useEffect(() => () => { Object.values(preview).forEach((url) => url && URL.revokeObjectURL(url)); }, [preview]);

  const set = (k: string, value: string) => { setV((s) => ({ ...s, [k]: value })); setErrors((e) => (e[k] ? { ...e, [k]: "" } : e)); };
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
    const skill = customSkill.trim().replace(/\s+/g, " ");
    if (skill.length < 2) return;
    if (!interests.some((i) => i.toLowerCase() === skill.toLowerCase())) setInterests((list) => [...list, skill]);
    setCustomSkill("");
    setShowCustomSkill(false);
    setErrors((e) => ({ ...e, interests: "" }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    for (const k of ["first_name", "last_name", "father_name"]) { const m = nameError(v[k] ?? ""); if (m) e[k] = m; }
    if (!v.class_level) e.class_level = "Select the class you study in.";
    if ((v.school_name ?? "").trim().length < 3) e.school_name = "Enter your school's full name.";
    if ((v.address ?? "").trim().length < 10) e.address = "Enter your full address (house, area, city, PIN code).";
    if (!v.email) e.email = "This field is required.";
    else if (!emailToken) e.email = "Please verify your email with the OTP (tap “Verify email”).";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = "Enter a valid email address, e.g. name@example.com.";
    if (!v.mobile) e.mobile = "This field is required."; else if (!isValidPhone(v.mobile)) e.mobile = PHONE_HINT;
    if (subject.trim().length < 2) e.subject = "Type your subject, e.g. Mathematics.";
    if (!interests.length) e.interests = "Choose at least one interest or add your own skill.";
    if ((v.aim_of_life ?? "").trim().length < 5) e.aim_of_life = "Please write a few words about your aim in life.";
    if (!/^\d{12}$/.test(v.aadhaar_number ?? "")) e.aadhaar_number = "Aadhaar number must have exactly 12 digits.";
    if (!photo) e.photo = "Upload your photo.";
    if (!signature) e.signature = "Upload your signature.";
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
    for (const k of ["first_name", "last_name", "email", "mobile", "father_name", "class_level", "school_name", "address", "subject_interest", "aim_of_life", "aadhaar_number"]) form.append(k, (v[k] ?? "").trim());
    form.append("subject", subject.trim());
    interests.forEach((i) => form.append("interests", i));
    form.append("email_token", emailToken);
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
      <StreShell>
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
          {done.status === "payment_pending" || done.status === "payment_submitted" ? (
            <div className="stre-hero bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-6 text-white sm:px-8">
              <Icon name="wallet" size={28} />
              <h1 className="mt-2 text-2xl font-semibold">One step left — pay the fee to confirm</h1>
              <p className="mt-1 text-sm text-amber-50">Your registration is <b>not confirmed</b> until the fee is paid. Your roll number and admit card are sent to {done.email} automatically right after payment.</p>
            </div>
          ) : (
            <div className="stre-hero bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-6 text-white sm:px-8">
              <Icon name="check" size={28} />
              <h1 className="mt-2 text-2xl font-semibold">Registration confirmed</h1>
              <p className="mt-1 text-sm text-emerald-50">Payment received. Your admit card has been emailed to {done.email}.</p>
            </div>
          )}
          <div className="space-y-4 p-5 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Registration number</p><p className="mt-1 select-all font-mono text-lg font-bold text-slate-900">{done.registration_no}</p></div>
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</p><p className="mt-1 text-sm font-semibold text-slate-900">{done.status_label}</p></div>
            </div>
            {info && <StrePayment reg={done} payment={info.payment} onUpdate={setDone} autoStart />}
            {done.status === "paid" && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Payment received — your registration is confirmed{done.roll_no ? ` (Roll no. ${done.roll_no})` : ""}. Your admit card is being prepared and will be emailed shortly.</p>}
            {done.status === "admit_card_issued" && <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><b className="block">Your admit card is ready — Roll no. {done.roll_no}</b>It has also been emailed to {done.email}.<Link href={`/stre/admit-card/${done.access_token}`} className="btn-primary mt-3 flex w-full sm:inline-flex sm:w-auto">Download admit card</Link></div>}
            <p className="text-xs leading-5 text-slate-500">Keep your registration number safe. You can check your status, pay the fee later and download your admit card any time using your registration number and mobile number.</p>
            <Link href={`/stre/status?token=${done.access_token}`} className="btn-primary">Open my status page</Link>
          </div>
        </section>
      </StreShell>
    );
  }

  return (
    <StreShell>
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
        <header className="bg-gradient-to-r from-[#3b1d6e] to-[#4f46e5] px-5 py-6 text-white sm:px-8 sm:py-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[.16em]"><Icon name="award" size={13} />Exam registration only</span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">STRE — Student Talent Recognition Exam</h1>
          <p className="mt-2 text-sm leading-6 text-indigo-100">This registration is only for the talent exam. It does not create a school portal account.</p>
          {info?.exam && (
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {[["Exam date", formatDate(info.exam.exam_date)], ["Last date", formatDate(info.exam.last_date)], ["Fee", Number(info.exam.fee) > 0 ? `₹${Number(info.exam.fee).toLocaleString("en-IN")}` : "Free"], ["Time", info.exam.exam_time || "To be announced"]].map(([k, val]) => (
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
            <p className="mandatory-note flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600"><span className="text-base font-bold leading-4 text-red-500">*</span><span>Fields marked with a red star are mandatory.</span></p>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-xs text-indigo-700">01</span>Student details</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {field("first_name", "First name", { autoComplete: "given-name", maxLength: 100 })}
                {field("last_name", "Last name", { autoComplete: "family-name", maxLength: 100 })}
                <div className="sm:col-span-2"><EmailOtpField value={v.email ?? ""} onChange={(email) => { set("email", email); if (emailToken) setEmailToken(""); }} token={emailToken} onToken={(t) => { setEmailToken(t); setErrors((x) => ({ ...x, email: "" })); }} error={errors.email} /></div>
                <label className={`block text-xs font-semibold text-slate-800 ${errors.mobile ? "has-error" : ""}`}>Mobile number<Req />
                  <input id="stre-mobile" name="mobile" className="input mt-1.5" type="tel" inputMode="tel" maxLength={14} placeholder="9876543210" value={v.mobile ?? ""} aria-invalid={errors.mobile ? true : undefined} onChange={(e) => set("mobile", cleanPhone(e.target.value))} />
                  {!errors.mobile && <span className="mt-1 block text-[11px] font-normal text-slate-500">10-digit mobile number</span>}
                  <Err msg={errors.mobile} />
                </label>
                {field("father_name", "Father's name", { maxLength: 150 })}
                <label className={`block text-xs font-semibold text-slate-800 ${errors.class_level ? "has-error" : ""}`}>Class (which class you study in)<span className="text-red-500" aria-hidden="true"> *</span>
                  <select id="stre-class_level" name="class_level" className="input mt-1.5" value={v.class_level ?? ""} aria-invalid={errors.class_level ? true : undefined} onChange={(e) => set("class_level", e.target.value)}>
                    <option value="">Select class</option>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((c) => <option key={c} value={c}>Class {c}</option>)}
                  </select>
                  {errors.class_level && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors.class_level}</span>}
                </label>
                {field("school_name", "School name", { maxLength: 200, placeholder: "e.g. Kendriya Vidyalaya BHU, Varanasi" })}
                <label className={`block text-xs font-semibold text-slate-800 sm:col-span-2 ${errors.address ? "has-error" : ""}`}>Address<span className="text-red-500" aria-hidden="true"> *</span>
                  <textarea id="stre-address" name="address" className="input mt-1.5" rows={2} maxLength={500} autoComplete="street-address" placeholder="House no., street, area, city, district, PIN code" value={v.address ?? ""} aria-invalid={errors.address ? true : undefined} onChange={(e) => set("address", e.target.value)} />
                  {errors.address && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{errors.address}</span>}
                </label>
                <label className={`block text-xs font-semibold text-slate-800 ${errors.subject ? "has-error" : ""}`}>Subject<Req />
                  <input id="stre-subject" className="input mt-1.5" maxLength={100} placeholder="Type your subject, e.g. Mathematics" autoComplete="off" value={v.subject ?? ""} aria-invalid={errors.subject ? true : undefined} onChange={(e) => { set("subject", e.target.value); setErrors((x) => ({ ...x, subject: "" })); }} />
                  <Err msg={errors.subject} />
                </label>
              </div>
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-xs text-indigo-700">02</span>Interests & goals</h2>
              <div className="grid gap-4">
                <label className="block text-xs font-semibold text-slate-800">Subject interest <span className="font-normal text-slate-400">(optional)</span>
                  <input id="stre-subject_interest" className="input mt-1.5" maxLength={1000} placeholder="e.g. Algebra, Physics experiments" value={v.subject_interest ?? ""} onChange={(e) => set("subject_interest", e.target.value)} />
                </label>
                <div className={`block text-xs font-semibold text-slate-800 ${errors.interests ? "has-error" : ""}`}>
                  <label htmlFor="stre-interests">Hobbies & interests<Req /> <span className="font-normal text-slate-500">— select one or more</span></label>
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
                    <option value="">{interests.length ? "Select another interest" : "Select interest"}</option>
                    {info.interest_options.filter((o) => !interests.includes(o)).map((o) => <option key={o} value={o}>{o}</option>)}
                    <option value={OTHER}>Other — add my own skill</option>
                  </select>
                  {showCustomSkill && (
                    <div className="mt-2 flex gap-2">
                      <input className="input" autoFocus maxLength={60} placeholder="Type your skill / hobby (e.g. Chess)" value={customSkill} onChange={(e) => setCustomSkill(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }} />
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
                <label className={`block text-xs font-semibold text-slate-800 ${errors.aim_of_life ? "has-error" : ""}`}>Aim of life<Req />
                  <textarea id="stre-aim_of_life" className="input mt-1.5" rows={3} maxLength={1000} placeholder="What do you want to become, and why?" value={v.aim_of_life ?? ""} aria-invalid={errors.aim_of_life ? true : undefined} onChange={(e) => set("aim_of_life", e.target.value)} />
                  <Err msg={errors.aim_of_life} />
                </label>
              </div>
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-xs text-indigo-700">03</span>Documents</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={`block text-xs font-semibold text-slate-800 sm:col-span-2 ${errors.aadhaar_number ? "has-error" : ""}`}>Student Aadhaar number<Req />
                  <input id="stre-aadhaar_number" className="input mt-1.5 font-mono tracking-wider" inputMode="numeric" autoComplete="off" maxLength={12} placeholder="12-digit Aadhaar number" value={v.aadhaar_number ?? ""} aria-invalid={errors.aadhaar_number ? true : undefined} onChange={(e) => set("aadhaar_number", e.target.value.replace(/\D/g, "").slice(0, 12))} />
                  {!errors.aadhaar_number && <span className="mt-1 block text-[11px] font-normal text-slate-500">Stored encrypted. Only the last 4 digits appear on the admit card.</span>}
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

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] leading-5 text-slate-500">By submitting, you confirm the details are correct. {Number(info.exam.fee) > 0 ? `A fee of ₹${Number(info.exam.fee).toLocaleString("en-IN")} is payable after registration.` : ""}</p>
              <button className="btn-primary w-full !py-3 sm:w-auto" disabled={busy}>{busy ? <><Spinner className="mr-2" />Submitting…</> : "Register for STRE"}</button>
            </div>
          </form>
        )}
      </section>
    </StreShell>
  );
}
