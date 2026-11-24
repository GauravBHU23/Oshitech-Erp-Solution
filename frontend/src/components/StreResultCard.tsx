"use client";
import Link from "next/link";
import { formatDate, streClassLabel } from "@/lib/stre";
import Icon from "@/components/Icon";

export type StreResultData = {
  roll_no: string; registration_no: string; full_name: string; exam_title: string; exam_date: string; total_marks: number;
  marks: number | null; is_absent: boolean; rank: number | null; percentage: number | null; award: string; candidates: number;
  father_name?: string; school_name?: string; class_level?: string; subject?: string; certificate_code?: string; access_token?: string; published_at?: string;
};

export default function ResultCard({ r }: { r: StreResultData }) {
  const merit = r.award === "Certificate of Merit";
  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
      <div className={`stre-hero px-5 py-6 text-white sm:px-8 ${merit ? "bg-gradient-to-r from-amber-500 to-orange-600" : r.is_absent ? "bg-gradient-to-r from-slate-600 to-slate-800" : "bg-gradient-to-r from-violet-700 to-indigo-600"}`}>
        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-white/80">{r.exam_title} · Result</p>
        <h1 className="mt-2 text-2xl font-semibold">{r.full_name}</h1>
        <p className="mt-1 text-sm text-white/85">Roll no. {r.roll_no}{r.class_level ? ` · ${streClassLabel(r.class_level)}` : ""}{r.school_name ? ` · ${r.school_name}` : ""}</p>
      </div>
      <div className="space-y-4 p-5 sm:p-8">
        {r.is_absent ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">You were marked <b>absent</b> in this exam. Contact the exam cell if this is a mistake.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Rank", r.rank ? `#${r.rank}` : "—", `of ${r.candidates}`], ["Marks", r.marks ?? "—", `out of ${r.total_marks}`], ["Percentage", r.percentage != null ? `${r.percentage}%` : "—", ""], ["Exam date", formatDate(r.exam_date), ""]].map(([k, v, sub]) => (
              <div key={String(k)} className="rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{v}</p>
                {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
              </div>
            ))}
          </div>
        )}
        {r.award && (
          <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center ${merit ? "border-amber-200 bg-amber-50" : "border-indigo-200 bg-indigo-50"}`}>
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white ${merit ? "bg-amber-500" : "bg-indigo-600"}`}><Icon name="award" size={24} /></span>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">{merit ? "Congratulations! " : ""}You have earned a {r.award}</p>
              <p className="text-xs text-slate-600">Download and print it. Anyone can check it is genuine by scanning its QR code.</p>
            </div>
            {r.access_token && <Link href={`/stre/certificate/${r.access_token}`} className="btn-primary w-full !py-3 sm:w-auto"><Icon name="download" size={15} className="mr-2" />Download certificate</Link>}
          </div>
        )}
      </div>
    </section>
  );
}

