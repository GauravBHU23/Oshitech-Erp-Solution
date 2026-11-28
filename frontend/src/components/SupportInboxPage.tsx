"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
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

type SupportMessage = {
  id: string;
  sender_type: "visitor" | "staff";
  sender_name: string;
  body: string;
  created_at: string;
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
  const [activeChatId, setActiveChatId] = useState("");
  const [chatMessages, setChatMessages] = useState<SupportMessage[]>([]);
  const [chatReply, setChatReply] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const activeChatIdRef = useRef("");

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

  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setInterval(() => {
      api<Paginated<SupportRequest>>("/support-requests/?page_size=100")
        .then((data) => setRequests(data.results))
        .catch((loadError: unknown) => setError(loadError instanceof ApiError ? loadError.message : "Could not refresh support requests."));
    }, 15000);
    return () => window.clearInterval(timer);
  }, [isAdmin]);

  const loadChatMessages = useCallback(async (requestId: string) => {
    try {
      const thread = await api<SupportMessage[]>(`/support-requests/${requestId}/messages/`);
      if (activeChatIdRef.current === requestId) {
        setChatMessages(thread);
        setError("");
      }
    } catch (loadError) {
      if (activeChatIdRef.current === requestId) {
        setError(loadError instanceof ApiError ? loadError.message : "Could not load this conversation.");
      }
    }
  }, []);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    if (!activeChatId) return;
    let active = true;
    const refreshMessages = async () => {
      try {
        const thread = await api<SupportMessage[]>(`/support-requests/${activeChatId}/messages/`);
        if (active) {
          setChatMessages(thread);
          setError("");
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof ApiError ? loadError.message : "Could not load this conversation.");
      }
    };
    void refreshMessages();
    const timer = window.setInterval(() => void refreshMessages(), 7000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activeChatId]);

  const sendChatReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeChatId || !chatReply.trim()) return;
    const requestId = activeChatId;
    setChatBusy(true);
    setError("");
    try {
      await api<SupportMessage>(`/support-requests/${requestId}/messages/`, {
        method: "POST",
        body: { body: chatReply.trim() },
      });
      setChatReply("");
      setRequests((current) => current.map((request) => request.id === requestId ? { ...request, status: "in_progress" } : request));
      if (activeChatIdRef.current === requestId) await loadChatMessages(requestId);
    } catch (sendError) {
      setError(sendError instanceof ApiError ? sendError.message : "Could not send this reply.");
    } finally {
      setChatBusy(false);
    }
  };

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
          <p className="mt-2 text-sm leading-6 text-slate-500">Messages refresh automatically. Super Admins can review guest website chats; school admins see requests for their school.</p>
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
          {activeChatId !== item.id && <p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-sm leading-6 text-slate-700">{item.message}</p>}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                if (activeChatId === item.id) {
                  activeChatIdRef.current = "";
                  setActiveChatId("");
                  setChatMessages([]);
                } else {
                  activeChatIdRef.current = item.id;
                  setActiveChatId(item.id);
                  setChatMessages([]);
                  setChatReply("");
                }
              }}
            >
              {activeChatId === item.id ? "Close conversation" : "View conversation"}
            </button>
            {activeChatId === item.id && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-xs text-slate-500">Messages refresh automatically while this conversation is open.</p>
                <div className="max-h-80 space-y-3 overflow-y-auto" aria-live="polite">
                  {chatMessages.map((message) => (
                    <div key={message.id} className={`flex ${message.sender_type === "staff" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${message.sender_type === "staff" ? "bg-indigo-700 text-white" : "bg-white text-slate-800 shadow-sm"}`}>
                        <p className={`text-[10px] font-semibold ${message.sender_type === "staff" ? "text-indigo-100" : "text-indigo-700"}`}>{message.sender_name}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.body}</p>
                        <time className={`mt-1 block text-right text-[10px] ${message.sender_type === "staff" ? "text-indigo-100" : "text-slate-400"}`} dateTime={message.created_at}>
                          {new Date(message.created_at).toLocaleString()}
                        </time>
                      </div>
                    </div>
                  ))}
                </div>
                <form onSubmit={sendChatReply} className="mt-4 flex items-end gap-2">
                  <label className="sr-only" htmlFor={`support-reply-${item.id}`}>Write a reply</label>
                  <textarea
                    id={`support-reply-${item.id}`}
                    className="input min-h-11 flex-1 resize-y"
                    value={chatReply}
                    onChange={(event) => setChatReply(event.target.value)}
                    placeholder="Write a reply to the visitor…"
                    maxLength={4000}
                    required
                  />
                  <button type="submit" className="btn-primary" disabled={chatBusy || !chatReply.trim()}>
                    {chatBusy ? "Sending…" : "Reply"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
