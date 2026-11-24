"use client";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

/** Service worker register karta hai (sirf production build me, taaki dev me purana cache na dikhe). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
}

export default function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const [canInstall, setCanInstall] = useState(false);
  const [ios, setIos] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const update = () => setCanInstall(!!deferredPrompt);
    update();
    setIos(isIos());
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);

  if (!canInstall && !ios) return null;

  const install = async () => {
    if (ios || !deferredPrompt) {
      setShowHelp((v) => !v);
      return;
    }
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    notify();
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={install}
        className={`install-app-btn inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 ${compact ? "w-10" : "px-3"}`}
        aria-label="Install Oshitech ERP app"
        title="Install app"
      >
        <Icon name="download" size={16} />
        {!compact && <span>Install app</span>}
      </button>
      {showHelp && (
        <span role="dialog" className="absolute right-0 top-12 z-[90] w-64 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs leading-5 text-slate-600 shadow-xl">
          <b className="block text-slate-900">Install on iPhone / iPad</b>
          Tap the <b>Share</b> button in Safari, then choose <b>Add to Home Screen</b>.
        </span>
      )}
    </span>
  );
}

/** Footer ka "Get the app" card: install button / iPhone steps / installed status. */
export function InstallAppCard({ variant = "footer" }: { variant?: "footer" | "sidebar" }) {
  const [state, setState] = useState<"loading" | "installable" | "ios" | "installed" | "manual">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const update = () => {
      if (isStandalone()) setState("installed");
      else if (deferredPrompt) setState("installable");
      else if (isIos()) setState("ios");
      else setState("manual");
    };
    update();
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    setBusy(true);
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") setState("installed");
    } finally {
      setBusy(false);
      notify();
    }
  };

  if (state === "loading") return null;

  if (variant === "sidebar") {
    if (state === "installed" || state === "manual") return null;
    return (
      <div className="sidebar-install mx-3 mb-2 shrink-0">
        {state === "installable" ? (
          <button type="button" onClick={install} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-3 py-2 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-500/25">
            <Icon name="download" size={14} />Install app
          </button>
        ) : (
          <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] leading-4 text-slate-400">Install: Safari → Share → <b>Add to Home Screen</b></p>
        )}
      </div>
    );
  }

  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/+$/, "");

  return (
    <div className="install-card rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/15 to-cyan-500/10 p-4">
      <div className="flex items-center gap-3">
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl shadow-lg shadow-indigo-950/40" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Oshitech ERP app</p>
          <p className="text-[11px] leading-4 text-slate-400">Works offline-ready, opens like a mobile app.</p>
        </div>
      </div>
      {state === "installable" && (
        <button type="button" onClick={install} disabled={busy} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#172238] transition hover:bg-indigo-50">
          <Icon name="download" size={16} />{busy ? "Installing…" : "Install app"}
        </button>
      )}
      {state === "installed" && <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300"><Icon name="check" size={14} />App installed on this device</p>}
      {state === "ios" && <p className="mt-3 text-xs leading-5 text-slate-300">On iPhone / iPad: open in <b>Safari</b> → tap <b>Share</b> → <b>Add to Home Screen</b>.</p>}
      {state === "manual" && <p className="mt-3 text-xs leading-5 text-slate-300">Open this site in <b>Chrome</b> or <b>Edge</b> and choose <b>Install app</b> (or <b>Add to Home screen</b>) from the browser menu ⋮.</p>}
      {state !== "installed" && siteUrl && (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/[0.06] p-2.5">
          <div className="shrink-0 rounded-lg bg-white p-1.5"><QRCodeSVG value={siteUrl} size={52} level="M" bgColor="#ffffff" fgColor="#172238" /></div>
          <p className="text-[11px] leading-4 text-slate-400">Scan with your phone's camera to open this site and install from there.</p>
        </div>
      )}
    </div>
  );
}
