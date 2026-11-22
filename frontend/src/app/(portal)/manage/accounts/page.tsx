"use client";
import { imageErrorMessage, shrinkPhoto } from "@/lib/image";
import { toast } from "@/lib/toast";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToastMessage } from "@/lib/toast";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import PasswordInput from "@/components/PasswordInput";
import type { Paginated, Row } from "@/lib/types";

export default function AccountAccessPage() {
  const { user } = useAuth();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [schools, setSchools] = useState<Row[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [schoolsError, setSchoolsError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useToastMessage(notice, "success");
  const [busy, setBusy] = useState(false);
  const [applications, setApplications] = useState<Row[]>([]);
  const [applicationError, setApplicationError] = useState("");
  const [refreshingApplications, setRefreshingApplications] = useState(false);
  const [refreshCountdown, setRefreshCountdown] = useState(30);
  const refreshCountdownRef = useRef(30);
  const refreshingApplicationsRef = useRef(false);
  const [reviewing, setReviewing] = useState("");

  const loadApplications = useCallback(async () => {
    if (refreshingApplicationsRef.current) return;
    refreshingApplicationsRef.current = true;
    setRefreshingApplications(true);
    try {
      const data = await api<Paginated<Row>>("/auth/registration-requests/?status=pending&page_size=100");
      setApplications(data.results);
      setApplicationError("");
    } catch (err) { setApplicationError(err instanceof ApiError ? err.message : "Unable to load applications."); }
    finally {
      refreshingApplicationsRef.current = false;
      setRefreshingApplications(false);
      refreshCountdownRef.current = 30;
      setRefreshCountdown(30);
    }
  }, []);
  useEffect(() => {
    void loadApplications();
    const countdownTimer = window.setInterval(() => {
      if (refreshingApplicationsRef.current) return;
      refreshCountdownRef.current -= 1;
      if (refreshCountdownRef.current <= 0) {
        void loadApplications();
      } else {
        setRefreshCountdown(refreshCountdownRef.current);
      }
    }, 1_000);
    return () => window.clearInterval(countdownTimer);
  }, [loadApplications]);

  useEffect(() => {
    if (user?.role !== "super_admin") return;
    let active = true;
    setSchoolsLoading(true);
    api<Paginated<Row>>("/schools/?page_size=200")
      .then((data) => {
        if (active) setSchools(data.results);
      })
      .catch((err) => {
        if (active) setSchoolsError(err instanceof ApiError ? err.message : "Unable to load schools.");
      })
      .finally(() => {
        if (active) setSchoolsLoading(false);
      });
    return () => { active = false; };
  }, [user?.role]);

  const createExamController = async (event: React.FormEvent) => {
    event.preventDefault();
    const targetSchoolId = user?.role === "super_admin" ? schoolId : user?.school;
    if (!targetSchoolId) {
      setError(user?.role === "super_admin" ? "Select a school for this exam controller." : "Sign in with a school administrator account and try again.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const body = new FormData();
      body.append("first_name", first); body.append("last_name", last); body.append("email", email); body.append("password", password);
      if (profilePhoto) body.append("profile_photo", profilePhoto);
      await api(`/schools/${targetSchoolId}/create-exam-controller/`, { method: "POST", body });
      setNotice(`Exam controller account created for ${email}. They can now sign in through the Exam Controller Admin Portal.`);
      setFirst(""); setLast(""); setEmail(""); setPassword(""); setProfilePhoto(null);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to create the account."); }
    finally { setBusy(false); }
  };

  const review = async (application: Row, action: "approve" | "reject") => {
    setReviewing(application.id); setNotice(""); setApplicationError("");
    try {
      const response = await api<{ detail: string }>(`/auth/registration-requests/${application.id}/${action}/`, { method: "POST" });
      setNotice(response.detail);
      await loadApplications();
    } catch (err) { setApplicationError(err instanceof ApiError ? err.message : "Unable to review the application."); }
    finally { setReviewing(""); }
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">Admin panel · Access</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Accounts & access</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Review student admissions and teacher registrations. Approved profiles stay inactive until the school assigns a class or teaching responsibilities.</p></header>

    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-indigo-600">Registration inbox</p><h2 className="mt-1 text-lg font-semibold text-slate-900">Pending applications <span className="ml-1 rounded-full bg-indigo-50 px-2 py-1 align-middle text-xs text-indigo-700">{applications.length}</span></h2><p className="mt-1 text-xs text-slate-500">Verify details before approval. Place and activate approved profiles from Students or Teachers.</p></div><div className="flex flex-wrap items-center gap-3"><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-500"><span className={`h-1.5 w-1.5 rounded-full ${refreshingApplications ? "bg-indigo-500 animate-pulse" : "bg-emerald-500"}`} />Auto-refresh in {refreshCountdown}s</span><button className="btn-ghost inline-flex min-w-[96px] items-center justify-center !py-2 text-xs" disabled={refreshingApplications} onClick={() => void loadApplications()}>{refreshingApplications ? <><Spinner className="mr-2 h-3.5 w-3.5" />Refreshing</> : "Refresh"}</button></div></div>
      {applicationError && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700">{applicationError}</p>}{notice && <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">{notice}</p>}
      {applications.length ? <div className="mt-5 grid gap-3 lg:grid-cols-2">{applications.map((application) => {
        const details = application.details ?? {};
        const student = application.role === "student";
        return <article key={application.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-2"><span className={`grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg ${student ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>{application.profile_photo ? <img src={application.profile_photo} alt="Applicant profile" className="h-full w-full object-cover" /> : <Icon name={student ? "student" : "teacher"} size={16} />}</span><div><h3 className="text-sm font-semibold text-slate-900">{application.first_name} {application.last_name}</h3><p className="text-[11px] text-slate-500">{student ? "Student admission" : "Teacher registration"} · {application.email}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">Application ref: {String(application.id).slice(0, 8).toUpperCase()}</p></div></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">Pending review</span></div>
          <div className="mt-3 grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-2"><p><span className="text-slate-400">School:</span> {application.school_name}</p><p><span className="text-slate-400">Phone:</span> {application.phone || details.guardian_phone || "—"}</p>{student ? <><p><span className="text-slate-400">Class:</span> {details.class_level ? `Class ${details.class_level}` : "?"}</p><p><span className="text-slate-400">Course:</span> {details.course_name}</p><p><span className="text-slate-400">Academic year:</span> {details.academic_year_name}</p><p><span className="text-slate-400">Father:</span> {details.father_name || details.guardian_name || "—"}</p><p><span className="text-slate-400">Mother:</span> {details.mother_name || "—"}</p><p><span className="text-slate-400">Date of birth:</span> {details.date_of_birth}</p>{details.aadhaar_number && <p className="sm:col-span-2"><span className="text-slate-400">Aadhaar (application review):</span> <span className="font-mono tracking-wider text-slate-800">{details.aadhaar_number}</span></p>}</> : <><p><span className="text-slate-400">Qualification:</span> {details.qualification}</p><p className="sm:col-span-2"><span className="text-slate-400">Teaching courses:</span> {(details.course_names ?? []).join(", ")}</p></>}</div>
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3"><button className="btn-ghost inline-flex items-center !px-3 !py-2 text-xs" disabled={!!reviewing} onClick={() => review(application, "reject")}>{reviewing === application.id ? <><Spinner className="mr-1.5 h-3.5 w-3.5" />Working…</> : "Reject"}</button><button className="btn-primary inline-flex items-center !px-3 !py-2 text-xs" disabled={!!reviewing} onClick={() => review(application, "approve")}>{reviewing === application.id ? <><Spinner className="mr-1.5 h-3.5 w-3.5" />Working…</> : "Approve registration"}</button></div>
        </article>;
      })}</div> : !applicationError && <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center"><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500"><Icon name="check" /></span><p className="mt-3 text-sm font-medium text-slate-700">No applications waiting for review</p><p className="mt-1 text-xs text-slate-400">New student and teacher registrations will appear here.</p></div>}
    </section>

    <section className="grid gap-5 lg:grid-cols-[1fr_1.1fr]"><div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700"><Icon name="ticket" /></span><div><h2 className="text-sm font-semibold text-slate-900">Exam controller</h2><p className="mt-0.5 text-xs text-slate-500">Issues course based exam admit cards</p></div></div>
      <form onSubmit={createExamController} className="mt-5 space-y-4">{user?.role === "super_admin" && <label className="block text-xs font-medium text-slate-600">School<select className="input mt-1.5" required value={schoolId} onChange={(e) => setSchoolId(e.target.value)} disabled={schoolsLoading || !schools.length}><option value="">{schoolsLoading ? "Loading schools…" : "Select a school"}</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name} ({school.code})</option>)}</select>{schoolsError && <span className="mt-1 block text-[11px] font-normal text-red-600">{schoolsError}</span>}{!schoolsLoading && !schoolsError && !schools.length && <span className="mt-1 block text-[11px] font-normal text-slate-400">Create a school first, then select it here.</span>}</label>}<div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-medium text-slate-600">First name<input className="input mt-1.5" required value={first} onChange={(e) => setFirst(e.target.value)} /></label><label className="block text-xs font-medium text-slate-600">Last name<input className="input mt-1.5" value={last} onChange={(e) => setLast(e.target.value)} /></label></div><label className="block text-xs font-medium text-slate-600">Login email<input className="input mt-1.5" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="block text-xs font-medium text-slate-600">Profile photo<input className="input mt-1.5 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700" type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (!file) { setProfilePhoto(null); return; } shrinkPhoto(file).then(setProfilePhoto).catch((err) => { setProfilePhoto(null); toast.error(imageErrorMessage(err)); }); }} /><span className="mt-1 block text-[11px] font-normal text-slate-400">Any photo size — resized automatically.</span></label><label className="block text-xs font-medium text-slate-600">Temporary password<PasswordInput className="input mt-1.5" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} /><span className="mt-1 block text-[11px] font-normal text-slate-400">At least 10 characters. Share this securely with the exam controller.</span></label>{error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</p>}{notice && <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs leading-5 text-emerald-800">{notice}</p>}<button className="btn-primary inline-flex w-full items-center justify-center !py-3" disabled={busy || (user?.role === "super_admin" && (schoolsLoading || !schoolId))}>{busy ? <><Spinner className="mr-2" />Creating account…</> : "Create exam controller account"}</button></form>
    </div><div className="space-y-4"><div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[.14em] text-indigo-600">After approval</p><ol className="mt-4 space-y-4">{[["01", "Student", "Assign the requested course/year to a classroom, then activate the student profile."], ["02", "Teacher", "Create the teaching assignments, then activate the teacher profile."], ["03", "Exam controller", "Share its separate sign in details so it can manage exams and issue admit cards."]].map(([n, title, text]) => <li key={n} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-[10px] font-semibold text-indigo-700 shadow-sm">{n}</span><div><h3 className="text-xs font-semibold text-slate-800">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div></li>)}</ol></div><div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><h3 className="text-sm font-semibold text-slate-900">Manage profiles</h3><div className="mt-3 grid gap-2 sm:grid-cols-2"><a className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs font-medium text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50" href="/manage/teachers">Teachers <span className="mt-1 block text-[10px] font-normal text-slate-400">Assignments and activation</span></a><a className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs font-medium text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50" href="/manage/students">Students <span className="mt-1 block text-[10px] font-normal text-slate-400">Class placement and activation</span></a></div></div></div></section>
  </div>;
}
