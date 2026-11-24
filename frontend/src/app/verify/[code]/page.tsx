"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { NGROK_SKIP_BROWSER_WARNING_HEADERS } from "@/lib/api";

type Verification = { valid: boolean; student_name?: string; exam?: string; school?: string } | null;

export default function VerifyPage({ params }: { params: { code: string } }) {
  const [result, setResult] = useState<Verification>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`/api/v1/exams/verify/${encodeURIComponent(params.code)}/`, {
      headers: NGROK_SKIP_BROWSER_WARNING_HEADERS,
    }).then((response) => response.json()).then(setResult).catch(() => setResult({ valid: false })).finally(() => setLoading(false));
  }, [params.code]);

  return <main className="verify-page relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f7fb] px-5 py-12"><div className="absolute -left-36 -top-40 h-[420px] w-[420px] rounded-full bg-indigo-200/40 blur-3xl" /><div className="absolute -bottom-40 -right-32 h-[420px] w-[420px] rounded-full bg-sky-100/80 blur-3xl" />
    
    <section className="verify-panel relative w-full max-w-md animate-rise-in rounded-[28px] border border-white bg-white/95 p-7 text-center shadow-xl shadow-slate-200/70 sm:p-9"><Link href="/" className="mx-auto inline-flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#20274a] text-sm font-bold text-white">O</span><span className="text-sm font-semibold text-slate-800">Oshitech <span className="font-normal text-slate-400">ERP</span></span></Link>
      {loading ? <><div className="mx-auto mt-8 grid h-16 w-16 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><span className="h-7 w-7 animate-spin rounded-full border-[3px] border-indigo-100 border-t-indigo-600" /></div><h1 className="mt-5 text-xl font-semibold text-slate-900">Verifying admit card</h1><p className="mt-2 text-sm text-slate-500">Checking this card with the school record.</p></> : result?.valid ? <><div className="mx-auto mt-8 grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon name="shield" size={30} /></div><p className="mt-5 text-xs font-semibold uppercase tracking-[.16em] text-emerald-700">Verification successful</p><h1 className="mt-2 text-2xl font-semibold text-slate-900">Valid admit card</h1><div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left"><p className="text-base font-semibold text-slate-900">{result.student_name}</p><p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Examination</p><p className="mt-1 text-sm text-slate-700">{result.exam}</p><p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">School</p><p className="mt-1 text-sm text-slate-700">{result.school}</p></div></> : <><div className="mx-auto mt-8 grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-red-600"><Icon name="ticket" size={28} /></div><p className="mt-5 text-xs font-semibold uppercase tracking-[.16em] text-red-600">Verification failed</p><h1 className="mt-2 text-2xl font-semibold text-slate-900">Card not valid</h1><p className="mt-2 text-sm leading-6 text-slate-500">This admit card could not be verified. Please contact the school examination office.</p></>}
      <p className="mt-7 border-t border-slate-100 pt-5 text-xs text-slate-400">Oshitech Education ERP <span className="px-1">·</span> Secure card verification</p>
    </section>
  </main>;
}
