"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const interacted = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("oshitech-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const enabled = interacted.current
      ? document.documentElement.dataset.theme === "dark"
      : saved ? saved === "dark" : prefersDark;
    setDark(enabled);
    document.documentElement.dataset.theme = enabled ? "dark" : "light";
    const syncTheme = () => setDark(document.documentElement.dataset.theme === "dark");
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== "oshitech-theme") return;
      const nextDark = event.newValue ? event.newValue === "dark" : prefersDark;
      setDark(nextDark);
      document.documentElement.dataset.theme = nextDark ? "dark" : "light";
    };
    window.addEventListener("oshitech:theme-change", syncTheme);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener("oshitech:theme-change", syncTheme);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  const toggle = () => {
    interacted.current = true;
    const enabled = !dark;
    setDark(enabled);
    document.documentElement.dataset.theme = enabled ? "dark" : "light";
    window.localStorage.setItem("oshitech-theme", enabled ? "dark" : "light");
    window.dispatchEvent(new Event("oshitech:theme-change"));
  };

  return <button type="button" onClick={toggle} aria-label={`Switch to ${dark ? "light" : "dark"} mode`} aria-pressed={dark} className="theme-toggle inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700" title={dark ? "Switch to light mode" : "Switch to dark mode"}>
    <Icon name={dark ? "sun" : "moon"} size={17} />
  </button>;
}
