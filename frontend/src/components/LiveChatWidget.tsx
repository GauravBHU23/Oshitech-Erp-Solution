"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import StreCaptcha, { type CaptchaValue } from "@/components/StreCaptcha";
import TurnstileWidget from "@/components/TurnstileWidget";
import { ApiError, api } from "@/lib/api";

type ChatMessage = {
  id: string;
  sender_type: "visitor" | "staff";
  sender_name: string;
  body: string;
  created_at: string;
};

type ChatSession = {
  id: string;
  access_token: string;
};

type StartChatResponse = ChatSession & {
  messages: ChatMessage[];
};

const STORAGE_KEY = "oshitech:live-chat";

export default function LiveChatWidget() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [reply, setReply] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaValue>({ captcha_id: "", captcha: "" });
  const [captchaReloadKey, setCaptchaReloadKey] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReloadKey, setTurnstileReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (
          parsed &&
          typeof parsed === "object" &&
          "id" in parsed &&
          typeof parsed.id === "string" &&
          "access_token" in parsed &&
          typeof parsed.access_token === "string"
        ) {
          setSession({ id: parsed.id, access_token: parsed.access_token });
        } else {
          window.sessionStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      setError("This browser could not restore your previous chat. You can still start a new one.");
    }
  }, []);

  const loadMessages = useCallback(async () => {
    if (!session) return;
    try {
      const thread = await api<ChatMessage[]>(`/live-chat/${session.id}/messages/`, {
        headers: { "X-Chat-Token": session.access_token },
      });
      setMessages(thread);
      setError("");
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 403) {
        setSession(null);
        setMessages([]);
        try {
          window.sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          setError("This chat is no longer available. Start a new chat.");
        }
        return;
      }
      setError(loadError instanceof ApiError ? loadError.message : "Could not load chat messages.");
    }
  }, [session]);

  useEffect(() => {
    if (!open || !session) return;
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 7000);
    return () => window.clearInterval(timer);
  }, [loadMessages, open, session]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const startChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!captcha.captcha_id || !captcha.captcha || !turnstileToken) {
      setError("Complete both security checks before starting the chat.");
      return;
    }

    setBusy(true);
    try {
      const started = await api<StartChatResponse>("/live-chat/", {
        method: "POST",
        body: {
          name,
          email,
          phone,
          message: firstMessage,
          captcha_id: captcha.captcha_id,
          captcha: captcha.captcha,
          turnstile_token: turnstileToken,
        },
      });
      const nextSession = { id: started.id, access_token: started.access_token };
      setSession(nextSession);
      setMessages(started.messages);
      setFirstMessage("");
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      } catch {
        setError("Chat is active, but this browser cannot restore it if you close or reload this page.");
      }
    } catch (startError) {
      setError(startError instanceof ApiError ? startError.message : "Could not start the chat.");
    } finally {
      setBusy(false);
      setCaptchaReloadKey((key) => key + 1);
      setTurnstileToken("");
      setTurnstileReloadKey((key) => key + 1);
    }
  };

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !reply.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api<ChatMessage>(`/live-chat/${session.id}/messages/`, {
        method: "POST",
        headers: { "X-Chat-Token": session.access_token },
        body: { body: reply.trim() },
      });
      setReply("");
      await loadMessages();
    } catch (sendError) {
      setError(sendError instanceof ApiError ? sendError.message : "Could not send your message.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {open && (
        <section
          aria-label="Live chat"
          className="fixed bottom-24 right-4 z-[90] flex h-[min(34rem,calc(100dvh-8rem))] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 sm:right-6"
        >
          <header className="flex items-center justify-between bg-[#20274a] px-4 py-3.5 text-white">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 18.5 3.5 20l1-4A8.5 8.5 0 1 1 7 18.5Z" />
                  <path strokeLinecap="round" d="M8 10h8M8 13.5h5" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-semibold">Oshitech Support</h2>
                <p className="text-[11px] text-indigo-100">Real team · replies when available</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label="Close live chat"
            >
              <span aria-hidden="true" className="text-xl leading-none">×</span>
            </button>
          </header>

          {!session ? (
            <form onSubmit={startChat} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-slate-100 px-3.5 py-3 text-sm leading-5 text-slate-700">
                  Send a message and a member of our support team will reply here. This is a real staff chat, not an automated chatbot.
                </div>
                <label className="block text-xs font-medium text-slate-700">
                  Your Name
                  <input className="input mt-1.5 w-full" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required maxLength={150} />
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Email
                  <input className="input mt-1.5 w-full" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required maxLength={254} />
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Phone <span className="font-normal text-slate-400">(Optional)</span>
                  <input className="input mt-1.5 w-full" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" maxLength={20} />
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Message
                  <textarea className="input mt-1.5 min-h-20 w-full resize-y" value={firstMessage} onChange={(event) => setFirstMessage(event.target.value)} required maxLength={4000} placeholder="How can our team help?" />
                </label>
                <StreCaptcha value={captcha} onChange={setCaptcha} reloadKey={captchaReloadKey} />
                <TurnstileWidget token={turnstileToken} onChange={setTurnstileToken} reloadKey={turnstileReloadKey} />
              </div>
              {error && <p role="alert" className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
              <div className="border-t border-slate-100 p-3">
                <button type="submit" className="btn-primary w-full" disabled={busy}>
                  {busy ? "Starting chat…" : "Start Chat"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4" aria-live="polite" aria-label="Chat messages">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.sender_type === "visitor" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${message.sender_type === "visitor" ? "rounded-br-sm bg-indigo-700 text-white" : "rounded-bl-sm bg-white text-slate-800 shadow-sm"}`}>
                      <p className={`mb-1 text-[10px] font-semibold ${message.sender_type === "visitor" ? "text-indigo-100" : "text-indigo-700"}`}>
                        {message.sender_type === "visitor" ? "You" : "Oshitech Support"}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.body}</p>
                      <time className={`mt-1 block text-right text-[10px] ${message.sender_type === "visitor" ? "text-indigo-100" : "text-slate-400"}`} dateTime={message.created_at}>
                        {new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </time>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              {error && <p role="alert" className="mx-3 mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
              <form onSubmit={sendReply} className="flex items-end gap-2 border-t border-slate-100 bg-white p-3">
                <label className="sr-only" htmlFor="live-chat-reply">Write a message</label>
                <textarea
                  id="live-chat-reply"
                  className="input max-h-28 min-h-11 flex-1 resize-y py-2.5"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Write a message…"
                  maxLength={4000}
                  required
                />
                <button type="submit" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-700 text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !reply.trim()} aria-label="Send message">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 3-7.5 18-3.4-7.1L3 10.5 21 3Zm0 0L10.1 13.9" />
                  </svg>
                </button>
              </form>
            </>
          )}
        </section>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-6 z-[90] grid h-14 w-14 place-items-center rounded-full bg-[#20274a] text-white shadow-lg shadow-indigo-950/25 transition hover:scale-105 hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-800"
          aria-label="Open live chat"
          title="Chat with our support team"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 18.5 3.5 20l1-4A8.5 8.5 0 1 1 7 18.5Z" />
            <path strokeLinecap="round" d="M8 10h8M8 13.5h5" />
          </svg>
        </button>
      )}
    </>
  );
}
