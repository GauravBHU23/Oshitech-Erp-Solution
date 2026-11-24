"use client";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Paginated, Row } from "@/lib/types";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

async function fetchAll(path: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 1; page < 50; page += 1) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await api<Paginated<Row>>(`${path}${sep}page_size=200&page=${page}`);
    out.push(...data.results);
    if (!data.next) break;
  }
  return out;
}

function gradeFor(percentage: number) {
  if (percentage >= 91) return "A1";
  if (percentage >= 81) return "A2";
  if (percentage >= 71) return "B1";
  if (percentage >= 61) return "B2";
  if (percentage >= 51) return "C1";
  if (percentage >= 41) return "C2";
  if (percentage >= 33) return "D";
  return "E";
}

type Sheet = {
  student: string;
  name: string;
  admission_no: string;
  roll_no: string;
  rows: { subject: string; max: number; pass: number; marks: number | null; absent: boolean; remarks: string }[];
  total: number;
  maxTotal: number;
  percentage: number;
  passed: boolean;
  complete: boolean;
  rank?: number;
};

function buildSheets(results: Row[], schedules: Row[]): Sheet[] {
  const byStudent = new Map<string, Row[]>();
  results.forEach((r) => byStudent.set(r.student, [...(byStudent.get(r.student) ?? []), r]));
  const sheets: Sheet[] = [];
  byStudent.forEach((rows, student) => {
    const first = rows[0];
    const lines = schedules.map((s) => {
      const r = rows.find((x) => x.subject === s.subject);
      return { subject: s.subject_name, max: s.max_marks, pass: s.pass_marks, marks: r && !r.is_absent && r.marks_obtained != null ? Number(r.marks_obtained) : null, absent: !!r?.is_absent, remarks: r?.remarks ?? "" };
    });
    const total = lines.reduce((sum, l) => sum + (l.marks ?? 0), 0);
    const maxTotal = lines.reduce((sum, l) => sum + l.max, 0);
    const complete = lines.every((l) => l.absent || l.marks !== null);
    const passed = complete && lines.every((l) => !l.absent && (l.marks ?? 0) >= l.pass);
    sheets.push({ student, name: first.student_name, admission_no: first.admission_no, roll_no: first.roll_no, rows: lines, total, maxTotal, percentage: maxTotal ? Math.round((total * 10000) / maxTotal) / 100 : 0, passed, complete });
  });
  const ranked = [...sheets].sort((a, b) => b.total - a.total);
  ranked.forEach((sheet, index) => { sheet.rank = index > 0 && ranked[index - 1].total === sheet.total ? ranked[index - 1].rank : index + 1; });
  return sheets.sort((a, b) => (a.roll_no || a.admission_no).localeCompare(b.roll_no || b.admission_no, undefined, { numeric: true }));
}

function Marksheet({ sheet, exam, school, classLabel, showRank }: { sheet: Sheet; exam: Row; school: Row | null; classLabel: string; showRank: boolean }) {
  return (
    <article className="report-card admit-paper print-card mx-auto w-full max-w-[190mm] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
      <header className="admit-card-header border-b-4 border-indigo-500 bg-slate-900 px-6 py-5 text-white">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-600 text-lg font-extrabold">{String(school?.name || "S").slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold uppercase leading-tight tracking-wide sm:text-lg">{school?.name ?? "School"}</h2>
            <p className="mt-1 text-[10px] text-white/75">{[school?.address, school?.city, school?.state].filter(Boolean).join(", ")}</p>
          </div>
          <div className="shrink-0 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-center text-[9px] font-extrabold uppercase leading-4 tracking-[0.1em]">Report<br />Card</div>
        </div>
      </header>
      <div className="space-y-5 px-6 py-6 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-indigo-700">{exam.academic_year_name} · {exam.course_name}</p>
            <h3 className="mt-1 text-base font-extrabold uppercase text-slate-900">{exam.name}</h3>
          </div>
          <span className={`status-pill ${sheet.passed ? "status-pill--green" : sheet.complete ? "status-pill--red" : "status-pill--amber"}`}>{sheet.passed ? "PASS" : sheet.complete ? "NOT PASSED" : "INCOMPLETE"}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-4">
          {[["Student", sheet.name], ["Admission no.", sheet.admission_no], ["Roll no.", sheet.roll_no || "—"], ["Class", classLabel || exam.course_name]].map(([label, value]) => (
            <div key={label} className="border-b border-slate-200 pb-2"><div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="mt-1 font-semibold text-slate-900">{value}</div></div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-[9px] uppercase tracking-wide text-slate-700">
              <tr>{["Subject", "Max", "Pass", "Obtained", "Grade", "Remarks"].map((h) => <th key={h} className="border border-slate-300 px-2 py-2">{h}</th>)}</tr>
            </thead>
            <tbody>
              {sheet.rows.map((r) => (
                <tr key={r.subject}>
                  <td className="border border-slate-300 px-2 py-2 font-semibold">{r.subject}</td>
                  <td className="border border-slate-300 px-2 py-2">{r.max}</td>
                  <td className="border border-slate-300 px-2 py-2">{r.pass}</td>
                  <td className={`border border-slate-300 px-2 py-2 font-semibold ${!r.absent && r.marks !== null && r.marks < r.pass ? "text-red-600" : ""}`}>{r.absent ? "AB" : r.marks ?? "—"}</td>
                  <td className="border border-slate-300 px-2 py-2">{r.absent || r.marks === null ? "—" : gradeFor((r.marks * 100) / r.max)}</td>
                  <td className="border border-slate-300 px-2 py-2">{r.remarks || "—"}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td className="border border-slate-300 px-2 py-2">Total</td>
                <td className="border border-slate-300 px-2 py-2">{sheet.maxTotal}</td>
                <td className="border border-slate-300 px-2 py-2" />
                <td className="border border-slate-300 px-2 py-2">{sheet.total}</td>
                <td className="border border-slate-300 px-2 py-2">{gradeFor(sheet.percentage)}</td>
                <td className="border border-slate-300 px-2 py-2">{sheet.percentage}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          <div className="rounded-xl border border-slate-200 p-3"><div className="text-[9px] font-bold uppercase text-slate-500">Percentage</div><div className="mt-1 text-lg font-bold text-slate-900">{sheet.percentage}%</div></div>
          <div className="rounded-xl border border-slate-200 p-3"><div className="text-[9px] font-bold uppercase text-slate-500">Overall grade</div><div className="mt-1 text-lg font-bold text-slate-900">{gradeFor(sheet.percentage)}</div></div>
          <div className="rounded-xl border border-slate-200 p-3"><div className="text-[9px] font-bold uppercase text-slate-500">{showRank ? "Class rank" : "Result"}</div><div className="mt-1 text-lg font-bold text-slate-900">{showRank ? sheet.rank : sheet.passed ? "Pass" : "—"}</div></div>
        </div>
        <p className="text-[9px] text-slate-500">Grades: A1 91–100 · A2 81–90 · B1 71–80 · B2 61–70 · C1 51–60 · C2 41–50 · D 33–40 · E below 33. AB = absent.</p>
        <div className="grid grid-cols-3 gap-3 pt-6 text-center text-[9px] font-semibold text-slate-600">
          {["Class teacher", "Exam controller", "Principal"].map((label) => <div key={label}><div className="h-10 border-b border-slate-400" /><div className="pt-1.5">{label}</div></div>)}
        </div>
      </div>
    </article>
  );
}

export default function ReportCardsPage() {
  const { user } = useAuth();
  const isStudent = user?.role === "student";
  const [exams, setExams] = useState<Row[]>([]);
  const [examId, setExamId] = useState("");
  const [classrooms, setClassrooms] = useState<Row[]>([]);
  const [classroom, setClassroom] = useState("");
  const [school, setSchool] = useState<Row | null>(null);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [error, setError] = useState("");
  const exam = exams.find((e) => e.id === examId);

  useEffect(() => {
    api<Paginated<Row>>(`/exams/exams/?page_size=200${isStudent ? "&results_published=true" : ""}`)
      .then((d) => { setExams(d.results); if (isStudent && d.results.length) setExamId(d.results[0].id); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Unable to load exams."));
    api<Paginated<Row>>("/schools/?page_size=1").then((d) => setSchool(d.results[0] ?? null)).catch(() => {});
  }, [isStudent]);

  useEffect(() => {
    setClassroom("");
    setClassrooms([]);
    if (!exam || isStudent) return;
    api<Paginated<Row>>(`/academics/classrooms/?course=${exam.course}&academic_year=${exam.academic_year}&page_size=200`)
      .then((d) => { setClassrooms(d.results); if (d.results.length === 1) setClassroom(d.results[0].id); })
      .catch(() => {});
  }, [exam, isStudent]);

  useEffect(() => {
    setSheets(null);
    if (!exam || (!isStudent && !classroom)) return;
    const resultPath = `/exams/results/?exam=${exam.id}${isStudent ? "" : `&student__classroom=${classroom}`}`;
    Promise.all([fetchAll(resultPath), fetchAll(`/exams/schedules/?exam=${exam.id}`)])
      .then(([results, schedules]) => { setSheets(buildSheets(results, schedules)); setError(""); })
      .catch((e) => { setError(e instanceof ApiError ? e.message : "Unable to load results."); setSheets([]); });
  }, [exam, classroom, isStudent]);

  const classLabel = useMemo(() => classrooms.find((c) => c.id === classroom)?.label ?? "", [classrooms, classroom]);

  return (
    <div className="admit-card-page space-y-5">
      <div className="no-print flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Examinations</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{isStudent ? "My Report Card" : "Report Cards"}</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{isStudent ? "Your marksheet appears here once the school publishes results." : "Marksheets with totals, percentage, grade and class rank. Print a whole class in one go."}</p>
        </div>
        <label className="min-w-[200px] text-xs font-medium text-slate-600">Exam
          <select className="input mt-1.5" value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Select exam…</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.name}{e.course_name ? ` · ${e.course_name}` : ""}{!isStudent && !e.results_published ? " (not published)" : ""}</option>)}
          </select>
        </label>
        {!isStudent && (
          <label className="min-w-[200px] text-xs font-medium text-slate-600">Classroom
            <select className="input mt-1.5" value={classroom} disabled={!exam} onChange={(e) => setClassroom(e.target.value)}>
              <option value="">{exam ? "Select classroom…" : "Select an exam first"}</option>
              {classrooms.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        )}
        <button className="btn-primary" disabled={!sheets?.length} onClick={() => window.print()}><Icon name="printer" size={16} className="mr-2" />Print / Save PDF</button>
      </div>
      {error && <div className="no-print rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {isStudent && exams.length === 0 && !error && <p className="no-print rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">No results have been published for you yet.</p>}
      {exam && !exam.results_published && !isStudent && <div className="no-print rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Results for this exam are not published yet. This is a draft view for staff.</div>}
      {sheets === null && exam && (isStudent || classroom) && <p className="no-print text-sm text-slate-500"><Spinner className="mr-2" />Preparing report cards…</p>}
      {sheets?.length === 0 && <p className="no-print rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">No marks have been entered for this selection yet.</p>}
      <div className="print-area grid grid-cols-1 justify-items-center gap-6 print:block">
        {exam && sheets?.map((sheet) => <Marksheet key={sheet.student} sheet={sheet} exam={exam} school={school} classLabel={classLabel} showRank={!isStudent} />)}
      </div>
    </div>
  );
}
