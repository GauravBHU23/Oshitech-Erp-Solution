"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";

export type CaptchaValue = { captcha_id: string; captcha: string };

/** Self-hosted captcha. `reloadKey` badalne par naya captcha (har koshish ke baad naya chahiye). */
export default function StreCaptcha({ value, onChange, reloadKey = 0, error }: { value: CaptchaValue; onChange: (v: CaptchaValue) => void; reloadKey?: number; error?: string }) {
  const [svg, setSvg] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ id: string; svg: string }>("/stre/captcha/");
      setSvg(res.svg);
      onChange({ captcha_id: res.id, captcha: "" });
    } catch { /* api shows toast */ } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load, reloadKey]);

  const src = svg ? `data:image/svg+xml;base64,${typeof window !== "undefined" ? window.btoa(svg) : ""}` : "";
  return (
    <div className={`text-xs font-semibold text-slate-800 ${error ? "has-error" : ""}`}>
      <span className="block">Security check<span className="text-red-500"> *</span> <span className="font-normal text-slate-500">— type the letters you see</span></span>
      <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
        <span className="stre-captcha-img grid h-[52px] w-[150px] shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:w-[170px]">
          {src ? <img src={src} alt="Captcha: type the characters shown" width={170} height={52} draggable={false} className="h-full w-full select-none object-cover" /> : <span className="text-[11px] text-slate-400">Loading…</span>}
        </span>
        <button
          type="button"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-indigo-600"
          onClick={load}
          disabled={loading}
          aria-label="Refresh captcha"
          title="Refresh captcha"
        >
          <span aria-hidden="true" className={`block text-base leading-none ${loading ? "animate-spin" : ""}`}>↻</span>
        </button>
        <input
          className="input min-w-0 flex-1 text-center font-mono uppercase tracking-[.3em] sm:w-36 sm:flex-none"
          aria-label="Captcha answer"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={5}
          placeholder="ABCDE"
          value={value.captcha}
          onChange={(e) => onChange({ ...value, captcha: e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 5) })}
        />
      </div>
      {error && <span role="alert" className="field-error mt-1 block text-[11px] font-medium">{error}</span>}
    </div>
  );
}
