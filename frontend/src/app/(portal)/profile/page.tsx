"use client";

import { imageErrorMessage, shrinkPhoto } from "@/lib/image";
import { toast } from "@/lib/toast";
import { useEffect, useState } from "react";
import { PHONE_HINT, PHONE_PATTERN } from "@/lib/validation";
import { useToastMessage } from "@/lib/toast";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL, type User } from "@/lib/types";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

type Profile = User & { qualification: string; is_public: boolean };

export default function MyProfilePage() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useToastMessage(notice, "success");

  useEffect(() => {
    api<Profile>("/auth/profile/").then(setProfile).catch(() => setError("Unable to load your profile."));
  }, []);

  useEffect(() => {
    if (!photo) { setPreview(profile?.profile_photo ?? ""); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo, profile]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setBusy(true); setError(""); setNotice("");
    const body = new FormData();
    body.append("first_name", profile.first_name);
    body.append("last_name", profile.last_name);
    body.append("phone", profile.phone);
    if (photo) body.append("profile_photo", photo);
    if (profile.role === "teacher") {
      body.append("qualification", profile.qualification ?? "");
      body.append("is_public", String(profile.is_public));
    }
    try {
      const updated = await api<Profile>("/auth/profile/", { method: "PATCH", body });
      setProfile(updated); setPhoto(null); setNotice("Profile updated.");
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update your profile.");
    } finally { setBusy(false); }
  };

  if (!user || !profile) return <div className="mx-auto max-w-3xl animate-pulse rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-400">Loading profile…</div>;
  const set = (field: keyof Profile, value: string | boolean) => setProfile((current) => current ? { ...current, [field]: value } : current);

  return <div className="mx-auto max-w-3xl space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">Account settings</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">My profile</h1><p className="mt-2 text-sm leading-6 text-slate-500">Update your name, contact number and profile photo. Your school role and login email stay managed by the school.</p></header>
    <form onSubmit={submit} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-col gap-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white p-5 sm:flex-row sm:items-center sm:p-7"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white bg-white text-2xl font-semibold text-indigo-700 shadow-sm">{preview ? <img src={preview} alt="Profile preview" className="h-full w-full object-cover" /> : (profile.first_name || profile.email).slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-slate-900">Profile photo</h2><p className="mt-1 text-xs leading-5 text-slate-500">Any photo — large images are resized automatically</p><label className="mt-3 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50"><Icon name="userPlus" size={14} />Choose photo<input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; shrinkPhoto(file).then(setPhoto).catch((err) => toast.error(imageErrorMessage(err))); }} /></label></div><span className="inline-flex items-center gap-2 self-start rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm sm:self-center"><Icon name={profile.role === "teacher" ? "teacher" : profile.role === "student" ? "student" : "school"} size={14} />{ROLE_LABEL[profile.role]}</span></div>
      <div className="space-y-5 p-5 sm:p-7"><div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-medium text-slate-600">First name<input className="input mt-1.5" required maxLength={150} value={profile.first_name} onChange={(event) => set("first_name", event.target.value)} /></label><label className="block text-xs font-medium text-slate-600">Last name<input className="input mt-1.5" maxLength={150} value={profile.last_name} onChange={(event) => set("last_name", event.target.value)} /></label><label className="block text-xs font-medium text-slate-600">Login email<input className="input mt-1.5 bg-slate-50 text-slate-500" value={profile.email} readOnly /></label><label className="block text-xs font-medium text-slate-600">Phone number<input className="input mt-1.5" type="tel" inputMode="tel" maxLength={14} pattern={PHONE_PATTERN} title={PHONE_HINT} placeholder="9876543210" value={profile.phone} onChange={(event) => set("phone", event.target.value)} /></label>
        {profile.role === "teacher" && <label className="block text-xs font-medium text-slate-600 sm:col-span-2">Qualification<input className="input mt-1.5" maxLength={200} value={profile.qualification ?? ""} onChange={(event) => set("qualification", event.target.value)} /></label>}</div>
        {profile.role === "teacher" && <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={profile.is_public} onChange={(event) => set("is_public", event.target.checked)} /><span><span className="block text-xs font-semibold text-slate-800">Show my teacher profile on the public homepage</span><span className="mt-1 block text-[11px] leading-5 text-slate-500">Your name, photo, school and assigned courses/subjects will be visible. Your phone number and email stay private.</span></span></label>}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] leading-5 text-slate-400">To change your login email or access role, contact your school administrator.</p><button className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 !px-5" disabled={busy}>{busy ? <><Spinner />Saving profile…</> : <>Save profile<Icon name="check" size={15} /></>}</button></div>
      </div>
    </form>
  </div>;
}
