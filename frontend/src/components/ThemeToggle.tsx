"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const syncTheme = () => setDark(document.documentElement.dataset.theme === "dark");
    syncTheme();
    window.addEventListener("oshitech:theme-change", syncTheme);
    return () => {
      window.removeEventListener("oshitech:theme-change", syncTheme);
    };
  }, []);

  const toggle = () => {
    const enabled = document.documentElement.dataset.theme !== "dark";
    setDark(enabled);
    document.documentElement.dataset.theme = enabled ? "dark" : "light";
    window.dispatchEvent(new Event("oshitech:theme-change"));
  };

  return <button type="button" onClick={toggle} aria-label={`Switch to ${dark ? "light" : "dark"} mode`} aria-pressed={dark} className="theme-toggle inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700" title={dark ? "Switch to light mode" : "Switch to dark mode"}>
    <Icon name={dark ? "sun" : "moon"} size={17} />
  </button>;
}
