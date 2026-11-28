"use client";
import { useEffect, useId, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    __turnstileLoad?: Promise<void>;
  }
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (window.__turnstileLoad) return window.__turnstileLoad;
  window.__turnstileLoad = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the verification check. Please refresh and try again."));
    document.head.appendChild(script);
  });
  return window.__turnstileLoad;
}

/** Cloudflare Turnstile ("I'm not a robot" check). `reloadKey` badalne par widget reset ho jata hai. */
export default function TurnstileWidget({ token, onChange, reloadKey = 0, error }: { token: string; onChange: (token: string) => void; reloadKey?: number; error?: string }) {
  const containerId = useId().replace(/[:]/g, "");
  const widgetIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        // React Strict Mode runs effects twice in dev; if cleanup already fired before
        // the script finished loading, skip rendering a widget nothing will remove.
        if (cancelled || !window.turnstile) return;
        const id = window.turnstile.render(`#${containerId}`, {
          sitekey: SITE_KEY,
          callback: (t: string) => onChange(t),
          "expired-callback": () => onChange(""),
          "error-callback": () => onChange(""),
        });
        if (cancelled) {
          window.turnstile.remove(id);
        } else {
          widgetIdRef.current = id;
        }
      })
      .catch(() => { /* widget shows its own retry UI; form validation blocks empty token */ });
    return () => {
      cancelled = true;
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = undefined;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reloadKey && widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  return (
    <div className={`text-xs font-semibold text-slate-800 ${error ? "has-error" : ""}`}>
      <span className="block">Security check<span className="text-red-500"> *</span> <span className="font-normal text-slate-500">— I'm not a robot</span></span>
      <div id={containerId} className="mt-1.5" />
      {error && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{error}</span>}
    </div>
  );
}
