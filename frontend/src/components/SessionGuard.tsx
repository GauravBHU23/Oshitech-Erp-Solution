"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Icon from "@/components/Icon";

const ACTIVITY_KEY = "oshitech-last-activity";
const REASON_KEY = "oshitech-logout-reason";
const WARN_BEFORE_MS = 2 * 60 * 1000;
const KEEPALIVE_MS = 10 * 60 * 1000;

export function setLogoutReason(reason: "idle" | "expired") {
  try { window.sessionStorage.setItem(REASON_KEY, reason); } catch { /* storage band */ }
}

export function takeLogoutReason(): string {
  try {
    const value = window.sessionStorage.getItem(REASON_KEY) || "";
    window.sessionStorage.removeItem(REASON_KEY);
    return value;
  } catch { return ""; }
}

function lastActivity() {
  try { return Number(window.localStorage.getItem(ACTIVITY_KEY)) || Date.now(); } catch { return Date.now(); }
}

/**
 * Kuch der kaam na karne par apne aap logout (sab tabs me ek saath).
 * Active rehne par session chupchap aage badhta hai; khatam hone se pehle chetavani.
 */
export default function SessionGuard({ idleMinutes = 30 }: { idleMinutes?: number }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const idleMs = idleMinutes * 60 * 1000;
  const [warning, setWarning] = useState(0); // bache hue seconds (0 = chetavani nahi)
  const lastPing = useRef(Date.now());
  const lastWrite = useRef(0);
  const ended = useRef(false);

  const markActive = useCallback(() => {
    const now = Date.now();
    if (now - lastWrite.current < 5000) return;
    lastWrite.current = now;
    try { window.localStorage.setItem(ACTIVITY_KEY, String(now)); } catch { /* ignore */ }
  }, []);

  const endSession = useCallback(async () => {
    if (ended.current) return;
    ended.current = true;
    setLogoutReason("idle");
    try { await logout(); } catch { /* session pehle hi khatam */ }
    router.replace("/login?reason=idle");
  }, [logout, router]);

  const stay = useCallback(async () => {
    lastWrite.current = 0;
    markActive();
    setWarning(0);
    try {
      await api("/auth/refresh/", { method: "POST", silent: true });
      lastPing.current = Date.now();
    } catch { /* api() logout event bhejega agar session khatam */ }
  }, [markActive]);

  useEffect(() => {
    if (!user) return;
    ended.current = false;
    lastWrite.current = 0;
    markActive();
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    const onFocus = () => markActive();
    window.addEventListener("focus", onFocus);

    const timer = window.setInterval(async () => {
      const idle = Date.now() - lastActivity();
      if (idle >= idleMs) { setWarning(0); void endSession(); return; }
      if (idle >= idleMs - WARN_BEFORE_MS) { setWarning(Math.ceil((idleMs - idle) / 1000)); return; }
      setWarning(0);
      // Active user: bina API call ke bhi session zinda rakho (har 10 min)
      if (Date.now() - lastPing.current > KEEPALIVE_MS && idle < KEEPALIVE_MS) {
        lastPing.current = Date.now();
        api("/auth/refresh/", { method: "POST", silent: true }).catch(() => {});
      }
    }, 1000);

    // Doosre tab me logout hua to yahan bhi
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVITY_KEY && warning) setWarning(0);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      events.forEach((e) => window.removeEventListener(e, markActive));
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, idleMs, markActive, endSession]);

  if (!user || !warning) return null;
  const mins = Math.floor(warning / 60);
  const secs = String(warning % 60).padStart(2, "0");
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-900/50 p-4 no-print" role="alertdialog" aria-modal="true" aria-labelledby="session-warning-title">
      <div className="session-warning w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-600"><Icon name="clock" size={24} /></span>
        <h2 id="session-warning-title" className="mt-3 text-lg font-semibold text-slate-900">Are you still there?</h2>
        <p className="mt-1 text-sm text-slate-600">For your security you will be signed out in</p>
        <p className="mt-2 font-mono text-3xl font-bold text-slate-900">{mins}:{secs}</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-ghost" onClick={() => void endSession()}>Sign out now</button>
          <button type="button" className="btn-primary" autoFocus onClick={() => void stay()}>Stay signed in</button>
        </div>
      </div>
    </div>
  );
}
