"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NGROK_SKIP_BROWSER_WARNING_HEADERS } from "@/lib/api";
import { formatDate } from "@/lib/stre";
import Icon from "@/components/Icon";
import StreShell from "@/components/StreShell";

type Verify = { valid: boolean; full_name?: string; roll_no?: string; exam_title?: string; exam_date?: string; award?: string; rank?: number | null; marks?: number | null; total_marks?: number } | null;

/** Certificate ke QR se: certificate asli hai ya nahi. */
export default function VerifyCertificatePage() {
  const { code } = useParams<{ code: string }>();
  const [v, setV] = useState<Verify>(null);
  useEffect(() => {
    fetch(`/api/v1/stre/certificate/verify/${encodeURIComponent(code)}/`, { headers: NGROK_SKIP_BROWSER_WARNING_HEADERS })
      .then((r) => r.json()).then(setV).catch(() => setV({ valid: false }));
  }, [code]);

  return (
    <StreShell support={false}>
      <section className="mx-auto max-w-md rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-xl">
        {!v ? <p className="text-sm text-slate-500">Verifying…</p> : v.valid ? (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon name="shield" size={30} /></div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[.16em] text-emerald-700">Genuine certificate</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">{v.full_name}</h1>
            <p className="mt-2 text-sm font-semibold text-slate-800">{v.award}{v.rank && v.award === "Certificate of Merit" ? ` · Rank ${v.rank}` : ""}</p>
            <p className="mt-1 text-sm text-slate-600">Roll no. <b className="font-mono">{v.roll_no}</b>{v.marks != null ? ` · ${v.marks}/${v.total_marks}` : ""}</p>
            <p className="mt-1 text-sm text-slate-600">{v.exam_title} · {formatDate(v.exam_date)}</p>
          </>
        ) : (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-red-600"><Icon name="close" size={28} /></div>
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">Not valid</h1>
            <p className="mt-2 text-sm text-slate-500">This certificate could not be verified. It may be fake or the result was withdrawn.</p>
          </>
        )}
      </section>
    </StreShell>
  );
}
