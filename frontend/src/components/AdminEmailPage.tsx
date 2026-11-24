"use client";
import { useState, type FormEvent } from "react";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";

export default function AdminEmailPage() {
  const { user } = useAuth();
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const isSchoolAdmin = user?.role === "school_admin";

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ detail: string }>("/admin-email/", {
        method: "POST",
        body: { recipient_email: recipient.trim(), subject: subject.trim(), message: message.trim() },
      });
      toast.success(result.detail);
      setSubject("");
      setMessage("");
    } catch {
      // api() displays the server error.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">Administration</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Send email</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {isSchoolAdmin
            ? "Send a private message to an active account in your school."
            : "Send a private message to one email address."}
        </p>
      </div>

      <form onSubmit={send} className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <label className="block text-sm font-medium text-slate-700">
          Recipient email
          <input className="input mt-1.5" type="email" required maxLength={254} autoComplete="email" placeholder="name@example.com" value={recipient} onChange={(event) => setRecipient(event.target.value)} />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            {isSchoolAdmin ? "Only active accounts belonging to your school can receive this message." : "Super Admin can send to any valid single address."}
          </span>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Subject
          <input className="input mt-1.5" required maxLength={200} value={subject} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Message
          <textarea className="input mt-1.5 min-h-40 resize-y py-3" required minLength={3} maxLength={5000} value={message} onChange={(event) => setMessage(event.target.value)} />
          <span className="mt-1 block text-right text-xs font-normal text-slate-400">{message.length}/5000</span>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">One recipient per message. Limit: 10 per hour.</p>
          <button className="btn-primary inline-flex min-h-10 items-center justify-center gap-2" disabled={busy}>
            {busy ? <><Spinner />Sending…</> : <><Icon name="megaphone" size={16} />Send email</>}
          </button>
        </div>
      </form>
    </div>
  );
}
