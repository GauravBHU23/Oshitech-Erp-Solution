"use client";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { formatDate, streClassLabel } from "@/lib/stre";
import Icon from "@/components/Icon";
import type { StreResultData } from "@/components/StreResultCard";

/** Merit / participation certificate: A4 landscape, print / Save as PDF, QR se verify. */
export default function StreCertificatePage({ params }: { params: { token: string } }) {
  const [r, setR] = useState<StreResultData | null>(null);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin((process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, ""));
    api<StreResultData>(`/stre/result/?token=${encodeURIComponent(params.token)}`, { silent: true })
      .then((d) => (d.award ? setR(d) : setError("A certificate is given only to candidates who appeared in the exam.")))
      .catch((e) => setError(e instanceof ApiError ? e.message.replace(/^detail:\s*/, "") : "Could not load the certificate."));
  }, [params.token]);

  const merit = r?.award === "Certificate of Merit";

  return (
    <main className="certificate-page stre-page min-h-screen bg-[#f6f7fb] px-3 py-4 sm:px-6 sm:py-8">
      <style>{`@media print { @page { size: A4 landscape; margin: 0; } .certificate-page { padding: 0 !important; background: #fff !important; } .cert-sheet { box-shadow: none !important; border-radius: 0 !important; width: 297mm !important; height: 210mm !important; max-width: none !important; } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[1000px] flex-wrap items-center justify-between gap-2">
        <Link href={`/stre/result?token=${params.token}`} className="btn-ghost"><Icon name="arrow" size={15} className="mr-2 rotate-180" />Back to result</Link>
        <button className="btn-primary" disabled={!r} onClick={() => window.print()}><Icon name="printer" size={16} className="mr-2" />Print / Save as PDF</button>
      </div>
      {error && <p role="alert" className="no-print mx-auto max-w-md rounded-2xl bg-amber-50 p-4 text-center text-sm text-amber-900">{error}</p>}
      {!r && !error && <p className="text-center text-sm text-slate-500">Loading certificate…</p>}
      {r && (
        <div className="overflow-x-auto">
          <article className="cert-sheet admit-paper mx-auto aspect-[297/210] w-full min-w-[640px] max-w-[1000px] overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className={`relative h-full w-full p-[3%] ${merit ? "bg-gradient-to-br from-amber-50 via-white to-amber-50" : "bg-gradient-to-br from-indigo-50 via-white to-violet-50"}`}>
              <div className={`flex h-full w-full flex-col items-center justify-between rounded-xl border-[6px] border-double px-[6%] py-[4%] text-center ${merit ? "border-amber-500" : "border-indigo-500"}`}>
                <div>
                  <p className={`text-[11px] font-bold uppercase tracking-[.35em] ${merit ? "text-amber-700" : "text-indigo-700"}`}>Student Talent Recognition Exam</p>
                  <h1 className="mt-2 font-serif text-[clamp(26px,4.2vw,46px)] font-bold leading-tight text-slate-900">{r.award}</h1>
                  <p className="mt-1 text-sm text-slate-600">{r.exam_title} · {formatDate(r.exam_date)}</p>
                </div>
                <div className="w-full">
                  <p className="text-sm italic text-slate-600">This is to certify that</p>
                  <p className="mx-auto mt-2 w-fit border-b-2 border-slate-300 px-6 pb-1 font-serif text-[clamp(22px,3.4vw,38px)] font-semibold text-slate-900">{r.full_name}</p>
                  <p className="mx-auto mt-3 max-w-[80%] text-sm leading-6 text-slate-700">
                    {r.father_name ? <>son/daughter of <b>{r.father_name}</b>, </> : null}
                    {r.class_level ? <>a student of {streClassLabel(r.class_level)}{r.school_name ? <>, <b>{r.school_name}</b></> : null}, </> : null}
                    {merit
                      ? <>has secured <b>Rank {r.rank}</b> with <b>{r.marks}/{r.total_marks}</b> marks ({r.percentage}%) and is awarded this certificate for outstanding performance.</>
                      : <>has successfully participated and scored <b>{r.marks}/{r.total_marks}</b> marks ({r.percentage}%).</>}
                  </p>
                </div>
                <div className="grid w-full grid-cols-3 items-end gap-4 text-[11px] text-slate-600">
                  <div className="text-left">
                    <p>Roll no. <b className="font-mono text-slate-900">{r.roll_no}</b></p>
                    <p>Certificate no. <b className="font-mono text-slate-900">{r.certificate_code}</b></p>
                    {r.published_at && <p>Issued {formatDate(r.published_at)}</p>}
                  </div>
                  <div className="verification-qr mx-auto flex flex-col items-center rounded-lg bg-white p-1.5">
                    {origin && r.certificate_code && <QRCodeSVG value={`${origin}/stre/verify-certificate/${r.certificate_code}`} size={86} level="M" marginSize={1} title="Scan to verify" />}
                    <span className="mt-0.5 text-[8px] font-bold uppercase">Scan to verify</span>
                  </div>
                  <div className="text-right">
                    <div className="ml-auto h-8 w-40 border-b border-slate-400" />
                    <p className="mt-1 font-semibold">Controller of Examination</p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
