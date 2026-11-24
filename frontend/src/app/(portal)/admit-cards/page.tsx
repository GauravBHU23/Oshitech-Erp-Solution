"use client";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Paginated, Row } from "@/lib/types";

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function Detail({ label, value }: { label: string; value: unknown }) {
  const text = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div className="min-w-0 border-b border-slate-200 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 break-words text-xs font-semibold text-slate-900">{text}</div>
    </div>
  );
}

export default function AdmitCardsPage() {
  const [exams, setExams] = useState<Row[]>([]);
  const [examId, setExamId] = useState("");
  const [cards, setCards] = useState<Row[] | null>(null);
  const [schedules, setSchedules] = useState<Record<string, Row[]>>({});
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const [courses, setCourses] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    api<Paginated<Row>>("/exams/exams/?page_size=200").then((d) => setExams(d.results)).catch(() => {});
    api<Paginated<Row>>("/academics/subjects/?page_size=200")
      .then((d) => setSubjects(Object.fromEntries(d.results.map((s) => [s.id, s.name]))))
      .catch(() => {});
    api<Paginated<Row>>("/academics/courses/?page_size=200")
      .then((d) => setCourses(Object.fromEntries(d.results.map((c) => [c.id, c.name]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setCards(null);
    setError("");
    const qs = examId ? `&exam=${examId}` : "";
    api<Paginated<Row>>(`/exams/admit-cards/?page_size=200${qs}`)
      .then(async (d) => {
        setCards(d.results);
        const ids = Array.from(new Set(d.results.map((c) => c.exam as string)));
        const entries = await Promise.all(
          ids.map(async (id) => [id, (await api<Paginated<Row>>(`/exams/schedules/?exam=${id}&page_size=200`)).results] as const)
        );
        setSchedules(Object.fromEntries(entries));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Unable to load admit cards."));
  }, [examId]);

  useEffect(() => {
    const publicUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    setOrigin(publicUrl.replace(/\/+$/, ""));
  }, []);

  return (
    <div className="admit-card-page space-y-5">
      <div className="no-print flex flex-wrap items-end gap-4">
        <div className="mr-auto">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">Examination office</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Admit Cards</h1>
          <p className="mt-1 text-sm text-slate-500">Preview, verify and print student entry passes.</p>
        </div>
        <label className="min-w-[220px] text-xs font-medium text-slate-600">
          Filter by exam
          <select className="input mt-1.5 !w-full" value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">All exams</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}{courses[e.course] ? ` · ${courses[e.course]}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primary min-h-11" onClick={() => window.print()} disabled={!cards?.length || !origin}>
          Print / Save as PDF
        </button>
      </div>
      {error && <div className="no-print rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {cards?.length === 0 && (
        <p className="no-print rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
          No admit cards found. Generate them from the Exams page first.
        </p>
      )}
      <div className="print-area grid grid-cols-1 justify-items-center gap-6 print:block">
        {cards?.map((c) => (
          <article key={c.id} className="admit-paper print-card mx-auto w-full max-w-[190mm] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
            <header className="admit-card-header border-b-4 border-indigo-500 bg-slate-900 px-6 py-5 text-white">
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-600 text-lg font-extrabold text-white">
                  {String(c.school_name || "S").trim().slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="admit-card-kicker text-[9px] font-bold uppercase tracking-[0.18em] text-indigo-200">
                    {c.school_code ? `Institution code · ${c.school_code}` : "Official examination document"}
                  </p>
                  <h2 className="admit-card-school-name mt-1 text-base font-extrabold uppercase leading-tight tracking-wide text-white sm:text-lg">
                    {c.school_name}
                  </h2>
                  <p className="admit-card-school-details mt-1 text-[10px] leading-4 text-white/75">
                    {[c.school_address, c.school_city, c.school_state]
                      .filter((part): part is string => typeof part === "string" && !!part.trim())
                      .join(", ")}
                    {c.school_phone ? ` · ${c.school_phone}` : ""}
                  </p>
                </div>
                <div className="admit-card-type shrink-0 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-center text-[9px] font-extrabold uppercase leading-4 tracking-[0.1em] text-white">
                  Examination
                  <br />
                  Admit Card
                </div>
              </div>
            </header>

            <div className="space-y-5 px-6 py-6 sm:px-7">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-indigo-700">
                    {c.academic_year_name} · {c.course_name}
                  </p>
                  <h3 className="mt-1 text-base font-extrabold uppercase leading-tight text-slate-900">{c.exam_name}</h3>
                </div>
                <p className="shrink-0 text-right text-[10px] font-semibold leading-5 text-slate-600">
                  <span className="block text-[8px] font-bold uppercase tracking-[0.12em] text-slate-500">Exam dates</span>
                  {formatDate(c.exam_start_date)} – {formatDate(c.exam_end_date)}
                </p>
              </div>

              <section className="admit-card-details grid grid-cols-[minmax(0,1fr)_30mm] gap-5">
                <div className="admit-card-detail-fields grid min-w-0 grid-cols-2 gap-x-5">
                  <Detail label="Candidate name" value={c.student_name} />
                  <Detail label="Father's name" value={c.father_name} />
                  <Detail label="Mother's name" value={c.mother_name} />
                  <Detail label="Admission number" value={c.admission_no} />
                  <Detail label="Roll number" value={c.roll_no} />
                  <Detail label="Class" value={c.class_level ? `Class ${c.class_level}` : "—"} />
                  <Detail label="Date of birth" value={formatDate(c.date_of_birth)} />
                </div>
                <div className="flex flex-col items-center">
                  <div className="flex h-[38mm] w-[30mm] items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-slate-50 text-center">
                    {c.student_photo ? (
                      <img
                        src={c.student_photo}
                        alt={`${c.student_name} photo`}
                        className="h-full w-full object-cover"
                        loading="eager"
                      />
                    ) : (
                      <span className="px-1 text-[8px] font-semibold uppercase leading-3 text-slate-500">
                        Candidate
                        <br />
                        photo
                        <br />
                        not uploaded
                      </span>
                    )}
                  </div>
                  <span className="mt-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">Student photo</span>
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-800">Examination schedule</h4>
                  <span className="text-[9px] text-slate-500">Report to the venue on time</span>
                </div>
                <div className="overflow-x-auto">
                  <p className="no-print mb-1 text-[9px] text-slate-400 sm:hidden">Swipe to view the full schedule.</p>
                  <table className="min-w-[560px] w-full border-collapse text-left text-[9px]">
                    <thead className="bg-slate-100 text-[8px] uppercase tracking-wide text-slate-700">
                      <tr>
                        <th className="border border-slate-300 px-2 py-2">No.</th>
                        <th className="border border-slate-300 px-2 py-2">Subject</th>
                        <th className="border border-slate-300 px-2 py-2">Date</th>
                        <th className="border border-slate-300 px-2 py-2">Time</th>
                        <th className="border border-slate-300 px-2 py-2">Venue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(schedules[c.exam] ?? []).map((s, index) => (
                        <tr key={s.id}>
                          <td className="border border-slate-300 px-2 py-2">{index + 1}</td>
                          <td className="border border-slate-300 px-2 py-2 font-semibold">{subjects[s.subject] ?? "—"}</td>
                          <td className="border border-slate-300 px-2 py-2">{formatDate(s.date)}</td>
                          <td className="whitespace-nowrap border border-slate-300 px-2 py-2">
                            {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                          </td>
                          <td className="border border-slate-300 px-2 py-2">{s.venue || "—"}</td>
                        </tr>
                      ))}
                      {(schedules[c.exam] ?? []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="border border-slate-300 px-2 py-3 text-center text-slate-500">
                            Schedule not announced
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <h4 className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-800">Candidate instructions</h4>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[8px] leading-4 text-slate-700">
                  <li>Bring this admit card and a valid school identity card to every examination.</li>
                  <li>Check the subject, date, reporting time and venue before each paper.</li>
                  <li>Follow the instructions of the examination centre and invigilator.</li>
                </ol>
              </section>

              <div className="admit-card-signature-layout grid grid-cols-[minmax(0,1fr)_38mm] items-end gap-4 border-t border-slate-200 pt-4">
                <div className="admit-card-signatures grid grid-cols-3 gap-3 text-center text-[8px] font-semibold text-slate-600">
                  {["Candidate signature", "Invigilator signature", "Principal / Controller"].map((label) => (
                    <div key={label}>
                      <div className="h-[15mm] border-b border-slate-400" />
                      <div className="pt-1.5">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="verification-qr flex flex-col items-center rounded-xl border border-slate-200 bg-white p-1.5 text-center">
                  {origin ? (
                    <QRCodeSVG
                      value={`${origin}/verify/${encodeURIComponent(String(c.code ?? ""))}`}
                      size={120}
                      level="Q"
                      marginSize={4}
                      title="Scan to verify this admit card"
                    />
                  ) : (
                    <div className="grid h-[120px] w-[120px] place-items-center text-[8px] font-semibold text-slate-500">Preparing QR</div>
                  )}
                  <span className="mt-1 text-[7px] font-bold uppercase tracking-wide text-slate-600">Scan to verify</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-slate-300 pt-3 text-[8px] text-slate-500">
                <span>Verification code: <b className="font-mono text-slate-700">{c.code}</b></span>
                <span>Issued {formatDate(c.created_at?.slice(0, 10))}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
