"use client";

import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Paginated } from "@/lib/types";

type SupportRequest = {
  id: string;
  email: string;
  role: string;
  school_name: string | null;
  name?: string;
  phone?: string;
  category: "login" | "bug" | "account" | "question" | "admission" | "contact" | "fees" | "other";
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
  updated_at: string;
};

const categoryLabels: Record<SupportRequest["category"], string> = {
  login: "Login problem",
  bug: "Website issue",
  account: "Account help",
  question: "Question",
  admission: "Admission enquiry",
  contact: "General enquiry",
  fees: "Fees enquiry",
  other: "Other",
};

const statusLabels: Record<SupportRequest["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

export default function SupportInboxPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "school_admin" || user?.role === "super_admin";
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState("");

  const load = () => {
    setLoading(true);
    api<Paginated<SupportRequest>>("/support-requests/?page_size=100")
      .then((data) => {
        setRequests(data.results);
        setError("");
      })
      .catch((loadError: unknown) => setError(loadError instanceof ApiError ? loadError.message : "Could not load support requests."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const updateStatus = async (item: SupportRequest, status: SupportRequest["status"]) => {
    setUpdating(item.id);
    setError("");
    try {
      const updated = await api<SupportRequest>(`/support-requests/${item.id}/`, {
        method: "PATCH",
        body: { status },
      });
      setRequests((current) => current.map((request) => request.id === item.id ? updated : request));
    } catch (updateError) {
      setError(updateError instanceof ApiError ? updateError.message : "Could not update this request.");
    } finally {
      setUpdating("");
    }
  };

  if (!isAdmin) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">This inbox is available to administrators only.</p>;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">Administrator tools</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Support inbox</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Reports from users in your school. Super Admins can review all reports, including login issues from guests.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={load} disabled={loading}>Refresh</button>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {loading && <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading reports…</p>}
      {!loading && !error && requests.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No support requests yet.</p>}
      {requests.map((item) => (
        <article key={item.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">{categoryLabels[item.category]}</span>
                <span className="text-[11px] text-slate-400">{new Date(item.created_at).toLocaleString()}</span>
              </div>
              <h2 className="mt-2 text-sm font-semibold text-slate-900">{item.subject}</h2>
              <p className="mt-1 break-words text-xs text-slate-500">{item.name ? `${item.name} · ` : ""}{item.email}{item.phone ? ` · ${item.phone}` : ""} · {item.role === "guest" ? "Guest" : item.role.replaceAll("_", " ")}{item.school_name ? ` · ${item.school_name}` : ""}</p>
            </div>
            <label className="text-xs font-medium text-slate-600">
              Status
              <select className="input mt-1 min-w-32" value={item.status} disabled={updating === item.id} onChange={(event) => void updateStatus(item, event.target.value as SupportRequest["status"])}>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-sm leading-6 text-slate-700">{item.message}</p>
        </article>
      ))}
    </section>
  );
}
