"use client";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/stre";
import { NGROK_SKIP_BROWSER_WARNING_HEADERS } from "@/lib/api";
import Icon from "@/components/Icon";
import StreShell from "@/components/StreShell";

type Result = { valid: boolean; full_name?: string; roll_no?: string; exam?: string; exam_date?: string } | null;

export default function StreVerifyPage({ params }: { params: { roll: string } }) {
  const [result, setResult] = useState<Result>(null);
  useEffect(() => {
    fetch(`/api/v1/stre/verify/${encodeURIComponent(params.roll)}/`, { headers: NGROK_SKIP_BROWSER_WARNING_HEADERS })
      .then((r) => r.json()).then(setResult).catch(() => setResult({ valid: false }));
  }, [params.roll]);

  return (
    <StreShell>
      <section className="mx-auto max-w-md rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-xl">
        {!result ? <p className="text-sm text-slate-500">Verifying…</p> : result.valid ? (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon name="shield" size={30} /></div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[.16em] text-emerald-700">Valid admit card</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">{result.full_name}</h1>
            <p className="mt-2 text-sm text-slate-600">Roll no. <b className="font-mono">{result.roll_no}</b></p>
            <p className="mt-1 text-sm text-slate-600">{result.exam} · {formatDate(result.exam_date)}</p>
          </>
        ) : (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-red-600"><Icon name="close" size={28} /></div>
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">Not valid</h1>
            <p className="mt-2 text-sm text-slate-500">This admit card could not be verified.</p>
          </>
        )}
      </section>
    </StreShell>
  );
}
