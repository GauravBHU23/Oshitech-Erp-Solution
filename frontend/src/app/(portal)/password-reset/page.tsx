"use client";

import { FormEvent, useEffect, useState } from "react";
import { useToastMessage } from "@/lib/toast";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL, type Paginated, type Role } from "@/lib/types";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import PasswordInput from "@/components/PasswordInput";

type ResettableAccount = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
};

export default function PasswordResetPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [changeError, setChangeError] = useState("");
  const [changeNotice, setChangeNotice] = useState("");
  useToastMessage(changeNotice, "success");

  const canResetOthers = user?.role === "super_admin" || (user?.role === "school_admin" && !!user.school);
  const [accounts, setAccounts] = useState<ResettableAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState("");
  const [accountSearchText, setAccountSearchText] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [targetAccountId, setTargetAccountId] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  useToastMessage(resetNotice, "success");

  useEffect(() => {
    if (!canResetOthers) return;
    let active = true;
    const params = new URLSearchParams({ page: "1" });
    if (accountSearch) params.set("search", accountSearch);
    setAccountsLoading(true);
    setAccountsError("");
    setAccounts([]);
    setTargetAccountId("");
    api<Paginated<ResettableAccount>>(`/auth/users/?${params.toString()}`)
      .then((response) => {
        if (!active) return;
        const available = response.results.filter((account) =>
          account.id !== user?.id &&
          (user?.role === "super_admin" || account.role !== "school_admin")
        );
        setAccounts(available);
        setTargetAccountId((current) =>
          available.some((account) => account.id === current) ? current : ""
        );
      })
      .catch((error) => {
        if (active) setAccountsError(error instanceof ApiError ? error.message : "Unable to load accounts.");
      })
      .finally(() => {
        if (active) setAccountsLoading(false);
      });
    return () => { active = false; };
  }, [accountSearch, canResetOthers, user?.id, user?.role]);

  const changeOwnPassword = async (event: FormEvent) => {
    event.preventDefault();
    setChangeError("");
    setChangeNotice("");
    if (newPassword !== confirmPassword) {
      setChangeError("The new passwords do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      const response = await api<{ detail: string }>("/auth/change-password/", {
        method: "POST",
        body: { current_password: currentPassword, new_password: newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setChangeNotice(response.detail);
    } catch (error) {
      setChangeError(error instanceof ApiError ? error.message : "Unable to update your password.");
    } finally {
      setChangingPassword(false);
    }
  };

  const resetSelectedPassword = async (event: FormEvent) => {
    event.preventDefault();
    setResetError("");
    setResetNotice("");
    if (!targetAccountId) {
      setResetError("Select an account first.");
      return;
    }
    if (temporaryPassword !== confirmTemporaryPassword) {
      setResetError("The temporary passwords do not match.");
      return;
    }
    const target = accounts.find((account) => account.id === targetAccountId);
    setResettingPassword(true);
    try {
      await api(`/auth/users/${targetAccountId}/reset-password/`, {
        method: "POST",
        body: { password: temporaryPassword },
      });
      setTemporaryPassword("");
      setConfirmTemporaryPassword("");
      setResetNotice(`Password reset for ${target?.email ?? "the selected account"}. Share the new password securely.`);
    } catch (error) {
      setResetError(error instanceof ApiError ? error.message : "Unable to reset the selected account's password.");
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">Account security</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Password Reset</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Update your password or reset access for an account you manage.</p>
      </header>

      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 p-5 sm:p-6">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon name="key" size={18} /></span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Change my password</h2>
            <p className="mt-1 text-xs text-slate-500">Enter your current password to set a new one.</p>
          </div>
        </div>
        <form onSubmit={changeOwnPassword} className="space-y-4 p-5 sm:p-6">
          <label className="block text-xs font-medium text-slate-600">
            Current password
            <PasswordInput className="input mt-1.5" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600">
              New password
              <PasswordInput className="input mt-1.5" autoComplete="new-password" minLength={10} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Confirm new password
              <PasswordInput className="input mt-1.5" autoComplete="new-password" minLength={10} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </label>
          </div>
          {changeError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{changeError}</p>}
          {changeNotice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{changeNotice}</p>}
          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button className="btn-primary inline-flex min-h-11 items-center gap-2" disabled={changingPassword}>
              {changingPassword ? <><Spinner />Updating password…</> : <>Update my password<Icon name="check" size={15} /></>}
            </button>
          </div>
        </form>
      </section>

      {canResetOthers && (
        <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 p-5 sm:p-6">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><Icon name="users" size={18} /></span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Reset another user’s password</h2>
              <p className="mt-1 text-xs text-slate-500">Choose an account you manage and set a temporary password.</p>
            </div>
          </div>
          <form onSubmit={resetSelectedPassword} className="space-y-4 p-5 sm:p-6">
            <label className="block text-xs font-medium text-slate-600">
              Search accounts
              <span className="mt-1.5 flex gap-2">
                <input className="input min-w-0" value={accountSearchText} onChange={(event) => setAccountSearchText(event.target.value)} placeholder="Name or email" />
                <button type="button" className="btn-ghost shrink-0" disabled={accountsLoading} onClick={() => setAccountSearch(accountSearchText.trim())}>Search</button>
              </span>
            </label>
            {accountsError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{accountsError}</p>}
            <label className="block text-xs font-medium text-slate-600">
              Select user
              <select className="input mt-1.5" required value={targetAccountId} onChange={(event) => setTargetAccountId(event.target.value)} disabled={accountsLoading || accounts.length === 0}>
                <option value="">{accountsLoading ? "Loading accounts…" : "Select an account"}</option>
                {accounts.map((account) => {
                  const name = `${account.first_name} ${account.last_name}`.trim();
                  return <option key={account.id} value={account.id}>{name ? `${name} · ` : ""}{ROLE_LABEL[account.role]} · {account.email}</option>;
                })}
              </select>
            </label>
            {!accountsLoading && !accountsError && accounts.length === 0 && <p className="text-xs text-slate-500">No eligible accounts found.</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                New temporary password
                <PasswordInput className="input mt-1.5" autoComplete="new-password" minLength={10} required value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Confirm temporary password
                <PasswordInput className="input mt-1.5" autoComplete="new-password" minLength={10} required value={confirmTemporaryPassword} onChange={(event) => setConfirmTemporaryPassword(event.target.value)} />
              </label>
            </div>
            <p className="text-xs leading-5 text-slate-500">Refresh sessions are revoked; existing access tokens may remain active for up to 15 minutes. Share the temporary password securely.</p>
            {resetError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{resetError}</p>}
            {resetNotice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{resetNotice}</p>}
            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button className="btn-primary inline-flex min-h-11 items-center gap-2" disabled={resettingPassword || accountsLoading || !targetAccountId}>
                {resettingPassword ? <><Spinner />Resetting password…</> : <>Reset selected password<Icon name="check" size={15} /></>}
              </button>
            </div>
          </form>
        </section>
      )}

      {user?.role === "school_admin" && !user.school && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Link this administrator account to a school before managing other users’ passwords.
        </p>
      )}
    </div>
  );
}
