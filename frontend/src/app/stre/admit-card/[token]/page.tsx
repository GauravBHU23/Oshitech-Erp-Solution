"use client";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { formatDate } from "@/lib/stre";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import StreCaptcha, { type CaptchaValue } from "@/components/StreCaptcha";

type Card = {
  registration_no: string; roll_no: string; full_name: string; father_name: string; school_name?: string; address?: string; class_level?: string; email: string; mobile: string; subject: string;
  aadhaar_last4: string; issued_at: string; photo_url: string; signature_url: string;
  exam: { title: string; code: string; exam_date: string; exam_time: string; reporting_time: string | null; venue: string; instructions: string };
};

function Row({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-slate-200 py-2"><div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="mt-0.5 break-words text-sm font-semibold text-slate-900">{value || "—"}</div></div>;
}

export default function StreAdmitCardPage({ params }: { params: { token: string } }) {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaValue>({ captcha_id: "", captcha: "" });
  const [captchaKey, setCaptchaKey] = useState(0);
  const [loading, setLoading] = useState(false);

  // Captcha bharne ke baad hi admit card khulta hai
  const open = async (event: React.FormEvent) => {
    event.preventDefault();
    if (captcha.captcha.length !== 5) { setError("Type the 5 characters shown in the image."); return; }
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ captcha_id: captcha.captcha_id, captcha: captcha.captcha });
      setCard(await api<Card>(`/stre/admit-card/${encodeURIComponent(params.token)}/?${qs}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message.replace(/^captcha:s*/, "") : "Could not load the admit card.");
      setCaptchaKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin((process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, ""));
  }, [params.token]);

  const instructions = (card?.exam.instructions || "Bring this admit card and a photo ID (Aadhaar / school ID).\nReach the centre before the reporting time.\nMobile phones, calculators and smart watches are not allowed.")
    .split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <main className="admit-card-page stre-page min-h-screen bg-[#f6f7fb] px-3 py-4 sm:px-6 sm:py-8">
      <div className="no-print mx-auto mb-4 flex max-w-[190mm] flex-wrap items-center justify-between gap-2">
        <Link href={`/stre/status?token=${params.token}`} className="btn-ghost"><Icon name="arrow" size={15} className="mr-2 rotate-180" />Back to status</Link>
        <button className="btn-primary" disabled={!card} onClick={() => window.print()}><Icon name="printer" size={16} className="mr-2" />Print / Save as PDF</button>
      </div>
      {!card && (
        <form onSubmit={open} noValidate className="no-print mx-auto max-w-md space-y-4 rounded-[22px] border border-slate-200 bg-white p-5 shadow-xl sm:p-7">
          <div className="text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700"><Icon name="ticket" size={22} /></span>
            <h1 className="mt-3 text-lg font-semibold text-slate-900">Open your STRE admit card</h1>
            <p className="mt-1 text-xs text-slate-500">Complete the security check to view and print your admit card.</p>
          </div>
          <StreCaptcha value={captcha} onChange={(c) => { setCaptcha(c); setError(""); }} reloadKey={captchaKey} />
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full !py-3" disabled={loading}>{loading ? <><Spinner className="mr-2" />Opening…</> : "View admit card"}</button>
        </form>
      )}
      {card && (
        <article className="admit-paper print-card mx-auto w-full max-w-[190mm] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <header className="admit-card-header border-b-4 border-indigo-500 bg-slate-900 px-5 py-4 text-white sm:px-6">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white"><Icon name="award" size={22} /></div>
              <div className="min-w-0 flex-1">
                <p className="admit-card-kicker text-[9px] font-bold uppercase tracking-[0.18em] text-indigo-200">Student Talent Recognition Exam</p>
                <h1 className="admit-card-school-name mt-0.5 text-base font-extrabold uppercase leading-tight sm:text-lg">{card.exam.title}</h1>
              </div>
              <div className="admit-card-type shrink-0 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-center text-[9px] font-extrabold uppercase leading-4 tracking-[0.1em]">Admit<br />Card</div>
            </div>
          </header>
          <div className="space-y-4 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-indigo-700">Roll number</p><p className="font-mono text-xl font-extrabold tracking-wider text-slate-900">{card.roll_no}</p></div>
              <div className="text-right text-xs font-semibold text-slate-700"><span className="block text-[9px] uppercase tracking-wider text-slate-500">Registration no.</span>{card.registration_no}</div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_30mm] gap-4">
              <div className="grid min-w-0 grid-cols-1 gap-x-4 sm:grid-cols-2">
                <Row label="Candidate name" value={card.full_name} />
                <Row label="Father's name" value={card.father_name} />
                <Row label="Subject" value={card.subject} />
                <Row label="Class" value={card.class_level ? `Class ${card.class_level}` : ""} />
                <Row label="School" value={card.school_name ?? ""} />
                <Row label="Aadhaar" value={card.aadhaar_last4 ? `XXXX XXXX ${card.aadhaar_last4}` : ""} />
                <Row label="Mobile" value={card.mobile} />
                <Row label="Email" value={card.email} />
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="h-[38mm] w-[30mm] overflow-hidden rounded-lg border border-slate-300 bg-slate-50"><img src={card.photo_url} alt="Candidate photo" className="h-full w-full object-cover" /></div>
                <div className="h-[12mm] w-[30mm] overflow-hidden rounded border border-slate-200 bg-white"><img src={card.signature_url} alt="Candidate signature" className="h-full w-full object-contain" /></div>
                <span className="text-[8px] font-bold uppercase text-slate-500">Candidate signature</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[["Exam date", formatDate(card.exam.exam_date)], ["Exam time", card.exam.exam_time || "—"], ["Reporting time", card.exam.reporting_time ? card.exam.reporting_time.slice(0, 5) : "—"], ["Exam code", card.exam.code]].map(([k, val]) => (
                <div key={k} className="rounded-xl border border-slate-200 p-2.5"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{k}</p><p className="mt-0.5 font-semibold text-slate-900">{val}</p></div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-200 p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Exam centre / venue</p><p className="mt-0.5 whitespace-pre-line text-sm font-semibold text-slate-900">{card.exam.venue || "Will be announced"}</p></div>
            <div className="grid grid-cols-[minmax(0,1fr)_32mm] items-end gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-800">Instructions</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[10px] leading-4 text-slate-700">{instructions.map((l) => <li key={l}>{l}</li>)}</ol>
              </div>
              <div className="verification-qr flex flex-col items-center rounded-xl border border-slate-200 bg-white p-1.5">
                {origin && <QRCodeSVG value={`${origin}/stre/verify/${encodeURIComponent(card.roll_no)}`} size={110} level="M" marginSize={2} title="Scan to verify" />}
                <span className="mt-1 text-[7px] font-bold uppercase text-slate-600">Scan to verify</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6 pt-6 text-center text-[9px] font-semibold text-slate-600">
              <div><div className="h-8 border-b border-slate-400" /><div className="pt-1">Invigilator signature</div></div>
              <div><div className="h-8 border-b border-slate-400" /><div className="pt-1">Exam controller</div></div>
            </div>
            <p className="border-t border-dashed border-slate-300 pt-2 text-center text-[8px] text-slate-500">Issued {formatDate(card.issued_at)} · Computer-generated admit card</p>
          </div>
        </article>
      )}
    </main>
  );
}
