"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { NGROK_SKIP_BROWSER_WARNING_HEADERS } from "@/lib/api";

type Verification = {
  valid: boolean;
  holder_name?: string;
  holder_type?: string;
  school?: string;
  class_level?: string;
  valid_until?: string;
  status?: "active" | "inactive" | "revoked";
} | null;

export default function VerifyIdPage() {
  const { code } = useParams<{ code: string }>();
  const [result, setResult] = useState<Verification>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`/api/v1/id-cards/verify/${encodeURIComponent(code)}/`, { headers: NGROK_SKIP_BROWSER_WARNING_HEADERS })
      .then((response) => response.json())
      .then(setResult)
      .catch(() => setResult({ valid: false }))
      .finally(() => setLoading(false));
  }, [code]);

  const found = !!result?.holder_name;
  const reason = result?.status === "revoked" ? "This card has been revoked by the school." : "This card has expired or the holder is no longer active.";

  return (
    <main className="verify-page relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f7fb] px-5 py-12">
      <div className="absolute -left-36 -top-40 h-[420px] w-[420px] rounded-full bg-indigo-200/40 blur-3xl" />
      <div className="absolute -bottom-40 -right-32 h-[420px] w-[420px] rounded-full bg-sky-100/80 blur-3xl" />
      
      <section className="verify-panel relative w-full max-w-md animate-rise-in rounded-[28px] border border-white bg-white/95 p-7 text-center shadow-xl shadow-slate-200/70 sm:p-9">
        <Link href="/" className="mx-auto inline-flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#20274a] text-sm font-bold text-white">O</span>
          <span className="text-sm font-semibold text-slate-800">Oshitech <span className="font-normal text-slate-400">ERP</span></span>
        </Link>
        {loading ? (
          <>
            <div className="mx-auto mt-8 grid h-16 w-16 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><span className="h-7 w-7 animate-spin rounded-full border-[3px] border-indigo-100 border-t-indigo-600" /></div>
            <h1 className="mt-5 text-xl font-semibold text-slate-900">Verifying ID card</h1>
            <p className="mt-2 text-sm text-slate-500">Checking this card with the school record.</p>
          </>
        ) : found ? (
          <>
            <div className={`mx-auto mt-8 grid h-16 w-16 place-items-center rounded-2xl ${result?.valid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><Icon name={result?.valid ? "shield" : "idcard"} size={30} /></div>
            <p className={`mt-5 text-xs font-semibold uppercase tracking-[.16em] ${result?.valid ? "text-emerald-700" : "text-amber-700"}`}>{result?.valid ? "Verification successful" : "Card not active"}</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">{result?.valid ? "Valid identity card" : "Card is not valid"}</h1>
            {!result?.valid && <p className="mt-2 text-sm leading-6 text-slate-500">{reason}</p>}
            <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left">
              <p className="text-base font-semibold text-slate-900">{result?.holder_name}</p>
              <p className="mt-1 text-sm text-slate-600">{[result?.holder_type, result?.class_level].filter(Boolean).join(" · ")}</p>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">School</p>
              <p className="mt-1 text-sm text-slate-700">{result?.school}</p>
              {result?.valid_until && (
                <>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Valid until</p>
                  <p className="mt-1 text-sm text-slate-700">{new Date(`${result.valid_until}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto mt-8 grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-red-600"><Icon name="idcard" size={28} /></div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[.16em] text-red-600">Verification failed</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Card not found</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">This ID card could not be verified. Please contact the school office.</p>
          </>
        )}
        <p className="mt-7 border-t border-slate-100 pt-5 text-xs text-slate-400">Oshitech Education ERP <span className="px-1">·</span> Secure ID verification</p>
      </section>
    </main>
  );
}
