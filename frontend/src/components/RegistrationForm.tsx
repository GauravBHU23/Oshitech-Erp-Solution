"use client";
import { imageErrorMessage, shrinkPhoto } from "@/lib/image";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { useState } from "react";
import { ApiError, api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { PHONE_HINT, PHONE_PATTERN, cleanPhone, dobError, fieldErrors, isValidPhone, nameError } from "@/lib/validation";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import DateInput from "@/components/DateInput";
import RegistrationApprovalSlip, { type RegistrationApprovalSlipData } from "@/components/RegistrationApprovalSlip";
import TurnstileWidget from "@/components/TurnstileWidget";
import StreCaptcha, { type CaptchaValue } from "@/components/StreCaptcha";
import { STRE_CASTE_CATEGORIES, STRE_STATES, streCasteCategoryLabel, streStateLabel } from "@/lib/stre";

type Portal = "student" | "teacher";
type Option = { id: string; name: string; code?: string };
type Options = { school: { name: string; code: string }; courses: Option[]; academic_years: Option[] };

const LABELS: Record<string, string> = {
  school_code: "School code", first_name: "First name", last_name: "Last name", email: "Email address", password: "Password",
  class_level: "Class", date_of_birth: "Date of birth", gender: "Gender", caste_category: "Caste category", state_code: "State", father_name: "Father's name", mother_name: "Mother's name",
  guardian_phone: "Parent phone", phone: "Phone", aadhaar_number: "Aadhaar number", address: "Full address",
  qualification: "Qualification", course_ids: "Courses", course_id: "Course", academic_year_id: "Academic year", profile_photo: "Profile photo",
};

function Req() {
  return <span className="text-red-500" aria-hidden="true"> *</span>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <span id={id} role="alert" className="field-error mt-1 block text-[11px] font-medium text-red-600">{message}</span>;
}

export default function RegistrationForm({ portal }: { portal: Portal }) {
  const isStudent = portal === "student";
  const [schoolCode, setSchoolCode] = useState("");
  const [options, setOptions] = useState<Options | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [values, setValues] = useState<Record<string, string>>({ role: portal, gender: "" });
  const [dobText, setDobText] = useState("");
  const [registrationSlip, setRegistrationSlip] = useState<RegistrationApprovalSlipData | null>(null);
  const [captcha, setCaptcha] = useState<CaptchaValue>({ captcha_id: "", captcha: "" });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const set = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const loadSchool = async () => {
    if (!schoolCode.trim()) { setErrors((e) => ({ ...e, school_code: "Enter your school code." })); return; }
    setError(""); setNotice(""); setLoadingOptions(true); setOptions(null); setSelectedCourses([]); setErrors({});
    try {
      const data = await api<Options>(`/auth/registration-options/?school_code=${encodeURIComponent(schoolCode.trim())}`);
      setOptions(data);
      toast.success(`School found: ${data.school.name}`);
    } catch (err) {
      const message = err instanceof ApiError && err.status === 404 ? "No active school found with this code. Check the code with your school office." : "Unable to verify the school code. Check your connection and try again.";
      setErrors({ school_code: message });
      toast.error(message);
    } finally { setLoadingOptions(false); }
  };

  /** Submit se pehle client-side checks, taaki user ko turant pata chale. */
  const validate = (form: HTMLFormElement) => {
    const next: Record<string, string> = {};
    // Har required / pattern field ka check (browser popup ki jagah field ke neeche message)
    Array.from(form.elements).forEach((element) => {
      const el = element as HTMLInputElement;
      if (!el.name || el.disabled || el.checkValidity()) return;
      next[el.name] = el.validity.valueMissing ? "This field is required." : el.validity.typeMismatch && el.type === "email" ? "Enter a valid email address, e.g. name@example.com." : el.title || el.validationMessage;
    });
    if (isStudent) {
      const dob = dobError(dobText);
      if (dob) next.date_of_birth = dob;
      if (values.guardian_phone && !isValidPhone(values.guardian_phone)) next.guardian_phone = PHONE_HINT;
      if (values.phone && !isValidPhone(values.phone)) next.phone = PHONE_HINT;
      if (values.aadhaar_number && values.aadhaar_number.length !== 12) next.aadhaar_number = "Aadhaar number must have 12 digits.";
      for (const key of ["father_name", "mother_name"]) { const msg = nameError(values[key] ?? ""); if (msg) next[key] = msg; }
    } else {
      if (!values.phone || !isValidPhone(values.phone)) next.phone = PHONE_HINT;
      if (selectedCourses.length === 0) next.course_ids = "Select at least one course you can teach.";
    }
    // Naam ki jaanch (sab portals): first name zaroori; student ke liye last name bhi zaroori
    { const msg = nameError(values.first_name ?? ""); if (msg) next.first_name = msg; }
    { const msg = nameError(values.last_name ?? "", isStudent); if (msg) next.last_name = msg; }
    if (values.password && values.password.length < 10) next.password = "Password must be at least 10 characters.";
    if (captcha.captcha.length !== 5) next.captcha = "Type the 5 characters shown in the image.";
    else if (!turnstileToken) next.captcha = "Please complete the verification check.";
    return next;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setNotice("");
    const clientErrors = validate(event.currentTarget as HTMLFormElement);
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      const first = Object.keys(clientErrors)[0];
      const message = `Please correct ${Object.keys(clientErrors).length === 1 ? LABELS[first] ?? "the highlighted field" : "the highlighted fields"}.`;
      setError(message);
      toast.error(message);
      document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = { ...values, role: portal, school_code: options?.school.code, ...captcha, turnstile_token: turnstileToken };
    if (isStudent) {
      if (!values.course_id) delete payload.course_id;
      if (!values.academic_year_id) delete payload.academic_year_id;
    }
    if (!isStudent) payload.course_ids = selectedCourses;
    try {
      let requestBody: Record<string, unknown> | FormData = payload;
      if (profilePhoto) {
        const form = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (Array.isArray(value)) value.forEach((item, index) => form.append(`${key}[${index}]`, String(item)));
          else if (value != null) form.append(key, String(value));
        });
        form.append("profile_photo", profilePhoto);
        requestBody = form;
      }
      const response = await api<{ id: string; detail: string }>("/auth/register/", { method: "POST", body: requestBody, silent: true });
      setNotice(`${response.detail} Application reference: ${response.id.slice(0, 8).toUpperCase()}.`);
      toast.success("Registration submitted. Download your approval slip.");
      if (options) {
        const baseSlip = {
          reference: response.id.slice(0, 8).toUpperCase(),
          submittedAt: new Date().toISOString(),
          schoolName: options.school.name,
          schoolCode: options.school.code,
          firstName: values.first_name ?? "",
          lastName: values.last_name ?? "",
          email: values.email ?? "",
          photo: profilePhoto,
        };
        if (isStudent) {
          setRegistrationSlip({
            ...baseSlip,
            role: "student",
            phone: values.phone ?? "",
            dateOfBirth: values.date_of_birth ?? "",
            classLevel: values.class_level ?? "",
            gender: values.gender ?? "",
            casteCategory: streCasteCategoryLabel(values.caste_category),
            state: streStateLabel(values.state_code),
            fatherName: values.father_name ?? "",
            motherName: values.mother_name ?? "",
            guardianPhone: values.guardian_phone ?? "",
            address: values.address ?? "",
            courseName: options.courses.find((course) => course.id === values.course_id)?.name ?? "",
            academicYearName: options.academic_years.find((year) => year.id === values.academic_year_id)?.name ?? "",
            aadhaarLastFour: values.aadhaar_number?.slice(-4) ?? "",
          });
        } else {
          setRegistrationSlip({
            ...baseSlip,
            role: "teacher",
            phone: values.phone ?? "",
            qualification: values.qualification ?? "",
            courses: options.courses.filter((course) => selectedCourses.includes(course.id)).map((course) => course.name),
          });
        }
      }
      setValues({ role: portal, gender: "" }); setDobText(""); setSelectedCourses([]); setProfilePhoto(null); setErrors({});
    } catch (err) {
      const serverErrors = fieldErrors(err);
      setErrors(serverErrors);
      const keys = Object.keys(serverErrors);
      const message = keys.length
        ? `Please correct: ${keys.map((key) => LABELS[key] ?? key).join(", ")}.`
        : err instanceof ApiError ? err.message : "Unable to submit the registration. Check your connection and try again.";
      setError(message);
      toast.error(message);
      if (keys[0]) document.querySelector<HTMLElement>(`[name="${keys[0]}"]`)?.focus();
    } finally {
      setBusy(false);
      setTurnstileToken("");
      setTurnstileKey((k) => k + 1);
    }
  };

  const printRegistrationSlip = () => {
    if (!registrationSlip) return;
    const previousTitle = document.title;
    document.title = `${registrationSlip.role}-Application-${registrationSlip.reference}`;
    window.print();
    document.title = previousTitle;
  };

  const control = (name: string) => ({
    name,
    id: `reg-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `reg-${name}-error` : undefined,
  });
  const wrap = (name: string, extra = "") => `block text-xs font-semibold text-slate-800 ${extra} ${errors[name] ? "has-error" : ""}`;

  const input = (name: string, label: string, type = "text", required = true, extra = "", more: Record<string, unknown> = {}, hint = "") => (
    <label className={wrap(name, extra)} key={name}>
      {label}{required && <Req />}
      <input className="input mt-1.5" type={type} required={required} minLength={type === "password" ? 10 : undefined} value={values[name] ?? ""} onChange={(event) => set(name, event.target.value)} {...control(name)} {...more} />
      {hint && !errors[name] && <span className="mt-1 block text-[11px] font-normal text-slate-500">{hint}</span>}
      <FieldError id={`reg-${name}-error`} message={errors[name]} />
    </label>
  );
  const phoneInput = (name: string, label: string, required: boolean) =>
    input(name, label, "tel", required, "", {
      inputMode: "tel", autoComplete: "tel", pattern: PHONE_PATTERN, title: PHONE_HINT, maxLength: 14, placeholder: "9876543210",
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => set(name, cleanPhone(event.target.value)),
    }, "10-digit mobile number");

  return <main className="registration-page registration-slip-page min-h-screen bg-[#f6f7fb] px-3 pb-24 pt-3 sm:px-6 sm:py-12"><div className="mx-auto max-w-3xl">
    <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2 sm:mb-6"><Link href="/" className="btn-ghost !py-2.5"><Icon name="home" size={16} /> <span className="ml-2">Home</span></Link><span className="flex items-center gap-2"><ThemeToggle /><Link href="/login" className="btn-primary !py-2.5"><Icon name="users" size={15} /><span className="mx-2">Switch portal</span><Icon name="arrow" size={14} /></Link></span></div>
    <section className="registration-slip-card overflow-hidden rounded-[28px] border border-white bg-white shadow-xl shadow-slate-200/70">
      <header className="no-print bg-gradient-to-r from-[#172238] to-[#26386e] px-5 py-6 text-white sm:px-9 sm:py-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/20 bg-white/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-indigo-100"><Icon name={isStudent ? "student" : "teacher"} size={14} />{isStudent ? "Student admission" : "Teacher application"}</div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">{isStudent ? "Student registration" : "Teacher registration"}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">{isStudent ? "Enter your admission details, parents' details, course and academic year." : "Share your contact, qualification and the courses you can teach."}</p>
      </header>
      {notice ? <><div className="no-print p-5 sm:p-9"><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-emerald-700"><Icon name="check" /></span><h2 className="mt-4 text-lg font-semibold text-emerald-950">Request sent for review</h2><p className="mt-2 text-sm leading-6 text-emerald-900">{notice}</p><p className="mt-2 text-xs leading-5 text-emerald-800">Your school administrator will review your request. Approved profiles need a class or teaching assignment before sign-in is enabled.</p>{registrationSlip && <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" className="btn-primary" onClick={printRegistrationSlip}>Download / Print A4 PDF</button><span className="text-xs text-emerald-800">Choose “Save as PDF” in the print dialog, or print a paper copy for school approval.</span></div>}<Link href={`/login/${portal}`} className="btn-primary mt-5">Go to {portal} sign in</Link></div></div>{registrationSlip && <RegistrationApprovalSlip data={registrationSlip} />}</> : <form onSubmit={submit} noValidate className="space-y-6 p-5 sm:p-9">
        <p className="mandatory-note flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600"><span className="text-base font-bold leading-4 text-red-500">*</span><span>Fields marked with a red star <b>(*)</b> are mandatory. Others are optional.</span></p>

        <section>
          <div className="mb-3 flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-xs font-semibold text-indigo-700">01</span><h2 className="text-sm font-semibold text-slate-900">School</h2></div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-3">
            <label className={wrap("school_code")}>School registration code<Req />
              <input className="input mt-1.5 uppercase" required autoCapitalize="characters" value={schoolCode} onChange={(event) => { setSchoolCode(event.target.value.toUpperCase().trim()); setOptions(null); setErrors((e) => ({ ...e, school_code: "" })); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void loadSchool(); } }} placeholder="Ask your school office" {...control("school_code")} />
              <FieldError id="reg-school_code-error" message={errors.school_code} />
            </label>
            <button type="button" className="btn-ghost w-full !py-2.5 sm:mt-[1.4rem] sm:w-auto" disabled={!schoolCode || loadingOptions} onClick={loadSchool}>{loadingOptions ? <><Spinner className="mr-2" />Checking…</> : <><Icon name="school" size={15} className="mr-2" />Find school</>}</button>
          </div>
          {options && (
            <div className="school-found mt-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-700"><Icon name="check" size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-emerald-700">School verified</p>
                <p className="mt-0.5 break-words text-sm font-semibold leading-5">{options.school.name}</p>
                <p className="mt-0.5 text-xs text-emerald-700">Code: <span className="font-mono font-semibold">{options.school.code}</span></p>
              </div>
              <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-800 underline-offset-2 hover:underline" onClick={() => { setOptions(null); setSchoolCode(""); }}>Change</button>
            </div>
          )}
          {!options && <p className="mt-2 text-[11px] text-slate-500">Enter the code and tap <b>Find school</b> to unlock the form below.</p>}
          {options && !isStudent && options.courses.length === 0 && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">Teacher registration is currently unavailable because this school has no active courses. Ask the school administrator to add an active course, then try again.</p>}
        </section>

        <section className={`${options ? "" : "pointer-events-none opacity-45"}`} aria-disabled={!options}>
          <div className="mb-3 flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-xs font-semibold text-indigo-700">02</span><h2 className="text-sm font-semibold text-slate-900">{isStudent ? "Admission details" : "Your profile"}</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {input("first_name", "First name", "text", true, "", { autoComplete: "given-name", maxLength: 150 })}
            {input("last_name", isStudent ? "Last name / surname" : "Last name", "text", isStudent, "", { autoComplete: "family-name", maxLength: 150 }, isStudent ? "Letters only, e.g. Sharma" : "")}
            {input("email", "Email address", "email", true, "", { autoComplete: "email" })}
            {input("password", "Create password", "password", true, "", { autoComplete: "new-password" }, "At least 10 characters; avoid common passwords.")}
            <label className={wrap("profile_photo", "sm:col-span-2")}>Profile photo<input className="input mt-1.5 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0] ?? null; setErrors((e) => ({ ...e, profile_photo: "" })); if (!file) { setProfilePhoto(null); return; } shrinkPhoto(file).then(setProfilePhoto).catch((err) => { setProfilePhoto(null); event.target.value = ""; setErrors((e) => ({ ...e, profile_photo: imageErrorMessage(err) })); }); }} {...control("profile_photo")} /><span className="mt-1 block text-[11px] font-normal text-slate-500">Any photo size — it is resized automatically. {profilePhoto ? `Selected: ${profilePhoto.name}` : ""}</span><FieldError id="reg-profile_photo-error" message={errors.profile_photo} /></label>
            {isStudent ? <>
              <label className={wrap("class_level")}>Class<Req /><select className="input mt-1.5" required value={values.class_level ?? ""} onChange={(event) => set("class_level", event.target.value)} {...control("class_level")}><option value="">Select class</option>{Array.from({ length: 12 }, (_, index) => String(index + 1)).map((grade) => <option key={grade} value={grade}>Class {grade}</option>)}</select><FieldError id="reg-class_level-error" message={errors.class_level} /></label>
              <label className={wrap("date_of_birth")}>Date of birth<Req />
                <DateInput id="reg-date_of_birth" required value={values.date_of_birth ?? ""} invalid={!!errors.date_of_birth} describedBy="reg-date_of_birth-hint" onChange={(iso, typed) => { setDobText(typed); set("date_of_birth", iso); }} />
                {!errors.date_of_birth && <span id="reg-date_of_birth-hint" className="mt-1 block text-[11px] font-normal text-slate-500">Format: DD/MM/YYYY — e.g. 15/08/2012</span>}
                <FieldError id="reg-date_of_birth-error" message={errors.date_of_birth} />
              </label>
              <label className={wrap("gender")}>Gender<Req /><select className="input mt-1.5" required value={values.gender} onChange={(event) => set("gender", event.target.value)} {...control("gender")}><option value="">Select gender</option><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option></select><FieldError id="reg-gender-error" message={errors.gender} /></label>
              <label className={wrap("caste_category")}>Caste category<Req /><select className="input mt-1.5" required value={values.caste_category ?? ""} onChange={(event) => set("caste_category", event.target.value)} {...control("caste_category")}><option value="">Select category</option>{STRE_CASTE_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><FieldError id="reg-caste_category-error" message={errors.caste_category} /></label>
              <label className={wrap("state_code")}>State<Req /><select className="input mt-1.5" required value={values.state_code ?? ""} onChange={(event) => set("state_code", event.target.value)} {...control("state_code")}><option value="">Select state</option>{STRE_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select><FieldError id="reg-state_code-error" message={errors.state_code} /></label>
              {input("father_name", "Father's name", "text", true, "", { maxLength: 150 })}
              {input("mother_name", "Mother's name", "text", true, "", { maxLength: 150 })}
              {phoneInput("guardian_phone", "Parent phone", true)}
              {phoneInput("phone", "Student phone", false)}
              <label className={wrap("aadhaar_number")}>Aadhaar number<input className="input mt-1.5" type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]{12}" maxLength={12} value={values.aadhaar_number ?? ""} onChange={(event) => set("aadhaar_number", event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="12-digit Aadhaar number" {...control("aadhaar_number")} /><span className="mt-1 block text-[10px] font-normal leading-4 text-slate-400">Optional. Stored encrypted for application review and removed after approval.</span><FieldError id="reg-aadhaar_number-error" message={errors.aadhaar_number} /></label>
              <label className={wrap("address", "sm:col-span-2")}>Full address<Req /><textarea className="input mt-1.5" required rows={3} maxLength={500} value={values.address ?? ""} onChange={(event) => set("address", event.target.value)} {...control("address")} /><FieldError id="reg-address-error" message={errors.address} /></label>
            </> : <>
              {phoneInput("phone", "Phone number", true)}
              {input("qualification", "Highest qualification", "text", true, "", { maxLength: 200, placeholder: "e.g. M.Sc., B.Ed." })}
              <div className={`sm:col-span-2 ${errors.course_ids ? "has-error" : ""}`} data-require-one><p className="mb-2 text-xs font-semibold text-slate-800">Courses you can teach<Req /></p><div className="grid gap-2 sm:grid-cols-2">{(options?.courses ?? []).map((course) => <label key={course.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-700"><input type="checkbox" checked={selectedCourses.includes(course.id)} onChange={(event) => { setErrors((e) => ({ ...e, course_ids: "" })); setSelectedCourses((current) => event.target.checked ? [...current, course.id] : current.filter((id) => id !== course.id)); }} />{course.name} <span className="text-slate-400">{course.code}</span></label>)}</div><FieldError id="reg-course_ids-error" message={errors.course_ids} /></div>
            </>}
          </div>
        </section>

        {isStudent && options && <section><div className="mb-3 flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-xs font-semibold text-indigo-700">03</span><div><h2 className="text-sm font-semibold text-slate-900">Course & academic year</h2><p className="mt-0.5 text-[11px] text-slate-500">Choose the course and session you are applying for.</p></div></div>{options.courses.length || options.academic_years.length ? <div className="grid gap-3 sm:grid-cols-2"><label className={wrap("course_id")}>Applying for course{options.courses.length > 0 && <Req />}<select className="input mt-1.5" required={options.courses.length > 0} value={values.course_id ?? ""} onChange={(event) => set("course_id", event.target.value)} {...control("course_id")}><option value="">{options.courses.length ? "Select course" : "No courses configured"}</option>{options.courses.map((course) => <option key={course.id} value={course.id}>{course.name} ({course.code})</option>)}</select><FieldError id="reg-course_id-error" message={errors.course_id} /></label><label className={wrap("academic_year_id")}>Academic year{options.academic_years.length > 0 && <Req />}<select className="input mt-1.5" required={options.academic_years.length > 0} value={values.academic_year_id ?? ""} onChange={(event) => set("academic_year_id", event.target.value)} {...control("academic_year_id")}><option value="">{options.academic_years.length ? "Select year" : "No academic years configured"}</option>{options.academic_years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select><FieldError id="reg-academic_year_id-error" message={errors.academic_year_id} /></label></div> : <p className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-800">You can submit your application using the class you selected. The school can assign a course and academic year later.</p>}</section>}

        <StreCaptcha value={captcha} onChange={(c) => { setCaptcha(c); setErrors((x) => ({ ...x, captcha: "" })); }} reloadKey={turnstileKey} error={errors.captcha} />
        <TurnstileWidget token={turnstileToken} onChange={(t) => { setTurnstileToken(t); setErrors((x) => ({ ...x, captcha: "" })); }} reloadKey={turnstileKey} />
        {error && <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-md text-[11px] leading-5 text-slate-400">Registration is reviewed by the school. Your account stays inactive until the school places and activates your profile.</p><button className="btn-primary w-full shrink-0 !py-3 sm:w-auto" data-skip-validation-guard disabled={busy || !options || (!isStudent && options.courses.length === 0)}>{busy ? <><Spinner className="mr-2" />Submitting…</> : !isStudent && options?.courses.length === 0 ? "No active courses available" : !options ? "Find your school first" : "Submit registration"}</button></div>
      </form>}
    </section>
    <div className="no-print mt-5 flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row"><p className="text-xs text-slate-500">Already registered? Sign in to your portal.</p><Link href={`/login/${portal}`} className="btn-primary !py-2.5"><Icon name="key" size={15} /><span className="mx-2">{portal === "student" ? "Student login" : "Teacher Admin login"}</span><Icon name="arrow" size={14} /></Link></div>
  </div></main>;
}
