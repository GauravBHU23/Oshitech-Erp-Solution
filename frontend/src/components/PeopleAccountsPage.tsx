"use client";

import { imageErrorMessage, shrinkPhoto } from "@/lib/image";
import { toast } from "@/lib/toast";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PHONE_HINT, PHONE_PATTERN } from "@/lib/validation";
import { useToastMessage } from "@/lib/toast";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { Paginated, Role } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/types";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import Modal from "@/components/Modal";
import { useAuth } from "@/lib/auth";
import PasswordInput from "@/components/PasswordInput";

type DirectoryAccount = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  profile_photo: string | null;
  role: Role;
  school_name: string;
  is_active: boolean;
  profile_active: boolean;
  last_login: string | null;
  date_joined: string;
  profile_reference: string;
  classroom_name: string;
  teacher_assignments: string[];
  profile_id: string;
  profile_details: Record<string, string | number | boolean | null>;
};
type DirectoryResponse = Paginated<DirectoryAccount> & { role_counts: Record<string, number> };

const roleIcon: Record<Role, string> = {
  stre_admin: "award",
  super_admin: "key",
  school_admin: "school",
  teacher: "teacher",
  student: "student",
  exam_controller: "ticket",
};
const DETAIL_LABELS: Record<string, string> = { admission_no: "Admission number", roll_no: "Roll number", class_level: "Class level", classroom: "Classroom", date_of_birth: "Date of birth", gender: "Gender", father_name: "Father's name", mother_name: "Mother's name", guardian_phone: "Parent phone", address: "Address", employee_id: "Employee ID", qualification: "Qualification", joining_date: "Joining date", public_profile: "Public teacher profile", profile_active: "School profile active" };

export default function PeopleAccountsPage({ initialRole = "" }: { initialRole?: string }) {
  const { user: currentUser } = useAuth();
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState(initialRole);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useToastMessage(notice, "success");
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<DirectoryAccount | null>(null);
  const [editValues, setEditValues] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<DirectoryAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [teacherProfileTarget, setTeacherProfileTarget] = useState<DirectoryAccount | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [qualification, setQualification] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      if (role) params.set("role", role);
      try {
        const result = await api<DirectoryResponse>(`/auth/users/?${params.toString()}`);
        if (alive) setData(result);
      } catch (err) {
        if (alive) setError(err instanceof ApiError ? err.message : "Unable to load accounts.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => { alive = false; };
  }, [page, search, role, reloadKey]);

  const counts = useMemo(() => ({
    teachers: data?.role_counts.teacher ?? 0,
    students: data?.role_counts.student ?? 0,
    controllers: data?.role_counts.exam_controller ?? 0,
    admins: (data?.role_counts.school_admin ?? 0) + (data?.role_counts.super_admin ?? 0),
  }), [data]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchText.trim());
  };

  const editAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = new FormData();
      Object.entries(editValues).forEach(([key, value]) => body.append(key, value));
      if (editPhoto) body.append("profile_photo", editPhoto);
      await api(`/auth/users/${editing.id}/`, { method: "PATCH", body });
      setNotice(`Account details updated for ${editValues.email}.`);
      setEditing(null); setEditPhoto(null); setReloadKey((value) => value + 1);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to update account details."); }
    finally { setBusy(false); }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordTarget) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/auth/users/${passwordTarget.id}/reset-password/`, { method: "POST", body: { password: newPassword } });
      setNotice(`Password reset for ${passwordTarget.email}. Share the temporary password securely.`);
      setPasswordTarget(null); setNewPassword("");
    } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to reset the password."); }
    finally { setBusy(false); }
  };

  const createTeacherProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!teacherProfileTarget) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/auth/users/${teacherProfileTarget.id}/create-teacher-profile/`, {
        method: "POST",
        body: { employee_id: employeeId.trim(), qualification },
      });
      setNotice(`Teacher profile created for ${teacherProfileTarget.email}. Assign classes and subjects, then activate the profile.`);
      setTeacherProfileTarget(null); setEmployeeId(""); setQualification("");
      setReloadKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create the teacher profile.");
    } finally { setBusy(false); }
  };

  const accountAction = async (account: DirectoryAccount, action: "block" | "unblock" | "delete") => {
    const confirmation = action === "delete"
      ? `Delete ${account.email}? This permanently removes the account and its linked ${account.role === "student" ? "student" : account.role === "teacher" ? "teacher" : "portal"} profile.`
      : `${action === "block" ? "Block" : "Unblock"} portal login for ${account.email}?`;
    if (!window.confirm(confirmation)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/auth/users/${account.id}/${action === "delete" ? "" : `${action}/`}`, action === "delete" ? { method: "DELETE" } : { method: "POST", body: {} });
      setNotice(action === "delete" ? `Deleted account ${account.email}.` : `Portal login ${action === "block" ? "blocked" : "unblocked"} for ${account.email}.`);
      setReloadKey((value) => value + 1);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to complete the account action."); }
    finally { setBusy(false); }
  };

  const pages = data ? Math.max(1, Math.ceil(data.count / 100)) : 1;

  return <div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">Workspace directory</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{initialRole === "exam_controller" ? "Exam Controllers" : "People & Accounts"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{initialRole === "exam_controller" ? "View and manage exam controller accounts and portal access." : "School users, portal roles, account access and last sign-in activity. Passwords are never shown here."}</p></div>
      <div className="portal-admin-card rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-right shadow-sm"><div className="text-xs text-slate-500">{initialRole === "exam_controller" ? "Exam controllers" : "Total accounts"}</div><div className="text-lg font-semibold text-slate-900">{data?.count ?? "—"}</div></div>
    </header>

    {!initialRole && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Accounts by role">
      {[["Teachers", counts.teachers, "teacher"], ["Students", counts.students, "student"], ["Exam controllers", counts.controllers, "ticket"], ["Administrators", counts.admins, "school"]].map(([label, value, icon]) => <div key={String(label)} className="portal-admin-card flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon name={String(icon)} size={18} /></span><div><div className="text-xs text-slate-500">{label}</div><div className="text-xl font-semibold text-slate-900">{loading ? "—" : value}</div></div></div>)}
    </section>}

    <section className="portal-admin-card flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:flex-row">
      <form onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-2"><input className="input" aria-label="Search accounts" placeholder="Search name, email or phone" value={searchText} onChange={(event) => setSearchText(event.target.value)} /><button className="btn-primary shrink-0" type="submit">Search</button></form>
      {!initialRole && <select className="input sm:!w-56" aria-label="Filter by portal role" value={role} onChange={(event) => { setPage(1); setRole(event.target.value); }}><option value="">All portal roles</option>{Object.entries(ROLE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}
    </section>

    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
    {loading && <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500"><Spinner />Loading accounts…</div>}
    {!loading && !error && data?.results.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No accounts match these filters.</div>}

    {!loading && !error && !!data?.results.length && <div className="grid gap-3 xl:grid-cols-2">{data.results.map((account) => {
      const name = `${account.first_name} ${account.last_name}`.trim() || account.email;
      const canManageAccount = account.id !== currentUser?.id && (account.role !== "super_admin" || currentUser?.role === "super_admin");
      return <article key={account.id} className="portal-admin-card rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2.5"><div className="flex min-w-0 items-center gap-2.5"><span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-indigo-50 text-indigo-700">{account.profile_photo ? <img src={account.profile_photo} alt={`${name} profile`} className="h-full w-full object-cover" /> : <Icon name={roleIcon[account.role]} />}</span><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-slate-900">{name}</h2><p className="truncate text-xs text-slate-500">{account.email}</p></div></div><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">{ROLE_LABEL[account.role]}</span></div>
        <dl className="mt-3 grid gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2">
          <div><dt className="text-[11px] text-slate-400">School</dt><dd className="mt-0.5 font-medium leading-5 text-slate-700">{account.school_name || "—"}</dd></div>
          <div><dt className="text-[11px] text-slate-400">Phone</dt><dd className="mt-0.5 font-medium leading-5 text-slate-700">{account.phone || "—"}</dd></div>
          {(account.role === "student" || account.role === "teacher") && <div><dt className="text-[11px] text-slate-400">{account.role === "student" ? "Admission number" : "Employee ID"}</dt><dd className="mt-0.5 font-medium leading-5 text-slate-700">{account.profile_reference || "Profile not linked"}</dd></div>}
          {account.role === "student" && <div><dt className="text-[11px] text-slate-400">Classroom</dt><dd className="mt-0.5 font-medium leading-5 text-slate-700">{account.classroom_name || "Not assigned"}</dd></div>}
          <div><dt className="text-[11px] text-slate-400">Portal login</dt><dd className="mt-0.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${account.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{account.is_active ? "Enabled" : "Disabled"}</span></dd></div>
          {(account.role === "student" || account.role === "teacher") && <div><dt className="text-[11px] text-slate-400">School profile</dt><dd className="mt-0.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${account.profile_active ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{account.profile_active ? "Active" : "Inactive"}</span></dd></div>}
          <div><dt className="text-[11px] text-slate-400">Last login</dt><dd className="mt-0.5 font-medium leading-5 text-slate-700">{account.last_login ? new Date(account.last_login).toLocaleString() : "Never signed in"}</dd></div>
          <div><dt className="text-[11px] text-slate-400">Account created</dt><dd className="mt-0.5 font-medium leading-5 text-slate-700">{new Date(account.date_joined).toLocaleString("en-IN")}</dd></div>
        </dl>
        {account.role === "teacher" && <div className="mt-3 border-t border-slate-100 pt-2"><p className="text-[11px] font-medium text-slate-500">Teaching assignments</p><p className="mt-0.5 text-xs text-slate-700">{account.teacher_assignments.length ? account.teacher_assignments.join(" · ") : "No assignments yet"}</p></div>}
        {Object.keys(account.profile_details).length > 0 && <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5"><summary className="cursor-pointer text-xs font-semibold text-slate-700">View complete profile data</summary><dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">{Object.entries(account.profile_details).map(([key, value]) => <div key={key} className={key === "address" ? "sm:col-span-2" : ""}><dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{DETAIL_LABELS[key] ?? key.replaceAll("_", " ")}</dt><dd className="mt-0.5 break-words text-xs text-slate-700">{typeof value === "boolean" ? (value ? "Yes" : "No") : value || "—"}</dd></div>)}</dl></details>}
        {account.role === "student" && <div className="mt-3 border-t border-slate-100 pt-2">{account.profile_id ? <Link href={`/manage/students?edit=${account.profile_id}`} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Edit full student record <Icon name="arrow" size={13} /></Link> : <span className="text-xs text-amber-700">Student profile not linked yet</span>}</div>}
        {account.role === "teacher" && <div className="mt-3 border-t border-slate-100 pt-2">{account.profile_id ? <Link href={`/manage/teachers?edit=${account.profile_id}`} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Edit full teacher record <Icon name="arrow" size={13} /></Link> : <span className="text-xs text-amber-700">Teacher profile not linked yet</span>}</div>}
        {canManageAccount && <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {account.role === "teacher" && !account.profile_id && <button type="button" className="btn-primary !min-h-9 !px-3 !py-1.5 !text-xs" disabled={busy} onClick={() => { setTeacherProfileTarget(account); setEmployeeId(""); setQualification(""); }}>Create teacher profile</button>}
          <button type="button" className="btn-ghost !min-h-9 !px-3 !py-1.5 !text-xs" disabled={busy} onClick={() => { setEditing(account); setEditPhoto(null); setEditValues({ first_name: account.first_name, last_name: account.last_name, email: account.email, phone: account.phone }); }}>Edit login details</button>
          {!(account.role === "school_admin" && currentUser?.role !== "super_admin") && <>
            <button type="button" className="btn-ghost !min-h-9 !px-3 !py-1.5 !text-xs" disabled={busy} onClick={() => { setPasswordTarget(account); setNewPassword(""); }}>Set temporary password</button>
            <button type="button" className={account.is_active ? "btn-ghost !min-h-9 !px-3 !py-1.5 !text-xs text-amber-700" : "btn-ghost !min-h-9 !px-3 !py-1.5 !text-xs text-emerald-700"} disabled={busy} onClick={() => void accountAction(account, account.is_active ? "block" : "unblock")}>{account.is_active ? "Block login" : "Unblock login"}</button>
            {(account.role !== "school_admin" || currentUser?.role === "super_admin") && <button type="button" className="btn-ghost !min-h-9 !px-3 !py-1.5 !text-xs text-red-600" disabled={busy} onClick={() => void accountAction(account, "delete")}>Delete account</button>}
          </>}
        </div>}
      </article>;
    })}</div>}

    {data && data.count > 100 && <div className="flex items-center justify-end gap-3 text-sm"><button className="btn-ghost" disabled={!data.previous || loading} onClick={() => setPage((current) => current - 1)}>Previous</button><span className="text-slate-500">Page {page} / {pages}</span><button className="btn-ghost" disabled={!data.next || loading} onClick={() => setPage((current) => current + 1)}>Next</button></div>}

    {editing && <Modal title="Edit account profile" onClose={() => setEditing(null)}><form onSubmit={editAccount} className="space-y-4"><p className="text-sm text-slate-500">Update the account photo, identity and contact details. Student and teacher academic profile details are edited from their profile lists.</p><label className="block text-xs font-medium text-slate-600">Profile photo<input className="input mt-1.5 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) { setEditPhoto(null); return; } shrinkPhoto(file).then(setEditPhoto).catch((err) => { setEditPhoto(null); toast.error(imageErrorMessage(err)); }); }} /><span className="mt-1 block text-[11px] font-normal text-slate-400">Any photo size — resized automatically.</span></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-medium text-slate-600">First name<input className="input mt-1.5" required maxLength={150} value={editValues.first_name} onChange={(event) => setEditValues((values) => ({ ...values, first_name: event.target.value }))} /></label><label className="block text-xs font-medium text-slate-600">Last name<input className="input mt-1.5" maxLength={150} value={editValues.last_name} onChange={(event) => setEditValues((values) => ({ ...values, last_name: event.target.value }))} /></label></div><label className="block text-xs font-medium text-slate-600">Login email<input className="input mt-1.5" type="email" required value={editValues.email} onChange={(event) => setEditValues((values) => ({ ...values, email: event.target.value }))} /></label><label className="block text-xs font-medium text-slate-600">Phone number<input className="input mt-1.5" type="tel" inputMode="tel" maxLength={14} pattern={PHONE_PATTERN} title={PHONE_HINT} placeholder="9876543210" value={editValues.phone} onChange={(event) => setEditValues((values) => ({ ...values, phone: event.target.value }))} /></label><div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-ghost" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? <><Spinner className="mr-2" />Saving…</> : "Save changes"}</button></div></form></Modal>}
    {teacherProfileTarget && <Modal title="Create teacher profile" onClose={() => setTeacherProfileTarget(null)}><form onSubmit={createTeacherProfile} className="space-y-4"><p className="text-sm text-slate-500">Link a school teaching profile to <strong className="text-slate-800">{teacherProfileTarget.email}</strong>. This keeps the existing login and password. The profile starts inactive until you assign teaching responsibilities.</p><label className="block text-xs font-medium text-slate-600">Employee ID<input className="input mt-1.5" required maxLength={30} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} /></label><label className="block text-xs font-medium text-slate-600">Qualification<input className="input mt-1.5" maxLength={200} value={qualification} onChange={(event) => setQualification(event.target.value)} /></label><div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-ghost" disabled={busy} onClick={() => setTeacherProfileTarget(null)}>Cancel</button><button className="btn-primary" disabled={busy || !employeeId.trim()}>{busy ? <><Spinner className="mr-2" />Creating…</> : "Create teacher profile"}</button></div></form></Modal>}
    {passwordTarget && <Modal title="Set temporary password" onClose={() => setPasswordTarget(null)}><form onSubmit={resetPassword} className="space-y-4"><p className="text-sm text-slate-500">Set a new login password for <strong className="text-slate-800">{passwordTarget.email}</strong>. The existing password cannot be viewed.</p><label className="block text-xs font-medium text-slate-600">New temporary password<PasswordInput className="input mt-1.5" autoComplete="new-password" required minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-ghost" disabled={busy} onClick={() => setPasswordTarget(null)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? <><Spinner className="mr-2" />Updating…</> : "Reset password"}</button></div></form></Modal>}
  </div>;
}
