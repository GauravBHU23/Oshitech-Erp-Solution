"use client";
import { useEffect, useMemo, useState } from "react";
import { useToastMessage } from "@/lib/toast";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Paginated, Row } from "@/lib/types";
import Spinner from "@/components/Spinner";

type Entry = { marks: string; absent: boolean; remarks: string };

function rowError(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(rowError).join(" ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(rowError).join(" ");
  return String(value);
}

export default function MarksEntryPage() {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const [exams, setExams] = useState<Row[]>([]);
  const [examId, setExamId] = useState("");
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [classrooms, setClassrooms] = useState<Row[]>([]);
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [classroom, setClassroom] = useState("");
  const [subject, setSubject] = useState("");
  const [students, setStudents] = useState<Row[] | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  useToastMessage(flash, "success");
  const [saving, setSaving] = useState(false);

  const exam = exams.find((e) => e.id === examId);
  const schedule = schedules.find((s) => s.subject === subject);
  const locked = !!exam?.results_locked;

  useEffect(() => {
    api<Paginated<Row>>("/exams/exams/?page_size=200").then((d) => setExams(d.results)).catch((e) => setError(e instanceof ApiError ? e.message : "Unable to load exams."));
    if (isTeacher) api<Paginated<Row>>("/academics/teaching-assignments/?page_size=200").then((d) => setAssignments(d.results)).catch(() => {});
  }, [isTeacher]);

  useEffect(() => {
    setSchedules([]);
    setClassrooms([]);
    setClassroom("");
    setSubject("");
    setStudents(null);
    if (!exam) return;
    api<Paginated<Row>>(`/exams/schedules/?exam=${exam.id}&page_size=200`).then((d) => setSchedules(d.results)).catch(() => {});
    api<Paginated<Row>>(`/academics/classrooms/?course=${exam.course}&academic_year=${exam.academic_year}&page_size=200`)
      .then((d) => { setClassrooms(d.results); if (d.results.length === 1) setClassroom(d.results[0].id); })
      .catch(() => {});
  }, [exam]);

  const subjectOptions = useMemo(() => {
    if (!isTeacher) return schedules;
    const allowed = new Set(assignments.filter((a) => !classroom || a.classroom === classroom).map((a) => a.subject));
    return schedules.filter((s) => allowed.has(s.subject));
  }, [schedules, assignments, classroom, isTeacher]);

  useEffect(() => {
    setStudents(null);
    setRowErrors({});
    setFlash("");
    if (!examId || !classroom || !subject) return;
    Promise.all([
      api<Paginated<Row>>(`/students/?classroom=${classroom}&is_active=true&page_size=200`),
      api<Paginated<Row>>(`/exams/results/?exam=${examId}&subject=${subject}&student__classroom=${classroom}&page_size=200`),
    ])
      .then(([list, results]) => {
        const byStudent = Object.fromEntries(results.results.map((r) => [r.student, r]));
        setEntries(Object.fromEntries(list.results.map((s) => {
          const r = byStudent[s.id];
          return [s.id, { marks: r && !r.is_absent && r.marks_obtained != null ? String(Number(r.marks_obtained)) : "", absent: !!r?.is_absent, remarks: r?.remarks ?? "" }];
        })));
        setStudents(list.results);
        setError("");
      })
      .catch((e) => { setError(e instanceof ApiError ? e.message : "Unable to load students."); setStudents([]); });
  }, [examId, classroom, subject]);

  const filled = students?.filter((s) => entries[s.id]?.absent || entries[s.id]?.marks !== "").length ?? 0;

  const save = async () => {
    if (!students) return;
    const rows = students.filter((s) => entries[s.id]?.absent || entries[s.id]?.marks !== "");
    if (!rows.length) { setError("Enter marks for at least one student."); return; }
    setSaving(true);
    setError("");
    setFlash("");
    setRowErrors({});
    try {
      const res = await api<{ detail: string }>("/exams/results/bulk/", {
        method: "POST",
        body: {
          exam: examId,
          subject,
          entries: rows.map((s) => ({ student: s.id, is_absent: entries[s.id].absent, marks_obtained: entries[s.id].absent ? null : entries[s.id].marks, remarks: entries[s.id].remarks })),
        },
      });
      setFlash(res.detail);
    } catch (e) {
      if (e instanceof ApiError && e.data && typeof e.data === "object" && "entries" in (e.data as Record<string, unknown>)) {
        const errs = (e.data as { entries: Record<string, unknown> }).entries;
        setRowErrors(Object.fromEntries(Object.entries(errs).map(([id, v]) => [id, rowError(v)])));
        setError("Some rows have problems (shown in red). Nothing was saved — fix them and save again.");
      } else {
        setError(e instanceof ApiError ? e.message : "Unable to save marks.");
      }
    } finally {
      setSaving(false);
    }
  };

  const max = schedule?.max_marks ?? 100;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Examinations</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Bulk Marks Entry</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-500">Choose an exam, class and subject, then enter marks for the whole class at once. Leave a row empty to skip it.</p>
      </div>
      <div className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">Exam
          <select className="input mt-1.5" value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Select exam…</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.name}{e.course_name ? ` · ${e.course_name}` : ""}{e.results_locked ? " (locked)" : ""}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Classroom
          <select className="input mt-1.5" value={classroom} disabled={!exam} onChange={(e) => setClassroom(e.target.value)}>
            <option value="">{exam ? "Select classroom…" : "Select an exam first"}</option>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Subject
          <select className="input mt-1.5" value={subject} disabled={!exam} onChange={(e) => setSubject(e.target.value)}>
            <option value="">{exam ? (subjectOptions.length ? "Select subject…" : "No scheduled subjects for you") : "Select an exam first"}</option>
            {subjectOptions.map((s) => <option key={s.subject} value={s.subject}>{s.subject_name} (max {s.max_marks})</option>)}
          </select>
        </label>
      </div>

      {locked && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Results for this exam are published and locked. An administrator must unlock them before marks can change.</div>}
      {flash && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{flash}</div>}
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {students !== null && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <tr><th className="px-4 py-3">Roll</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Marks (out of {max})</th><th className="px-4 py-3">Absent</th><th className="px-4 py-3">Remarks</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-slate-400">No active students in this classroom.</td></tr>}
                {students.map((s) => {
                  const entry = entries[s.id] ?? { marks: "", absent: false, remarks: "" };
                  const over = entry.marks !== "" && (Number(entry.marks) > max || Number(entry.marks) < 0);
                  const failed = schedule && entry.marks !== "" && !entry.absent && Number(entry.marks) < schedule.pass_marks;
                  return (
                    <tr key={s.id} className={rowErrors[s.id] ? "bg-red-50/60" : ""}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{s.roll_no || "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-800">{`${s.user?.first_name ?? ""} ${s.user?.last_name ?? ""}`.trim()}</div>
                        <div className="text-xs text-slate-400">{s.admission_no}</div>
                        {rowErrors[s.id] && <div className="mt-1 text-xs text-red-600">{rowErrors[s.id]}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          className={`input !w-28 !py-1.5 ${over ? "!border-red-400" : ""}`}
                          type="number" inputMode="decimal" min={0} max={max} step="0.5"
                          aria-label={`Marks for ${s.user?.first_name ?? "student"}`}
                          disabled={entry.absent || locked}
                          value={entry.marks}
                          onChange={(e) => setEntries((m) => ({ ...m, [s.id]: { ...entry, marks: e.target.value } }))}
                        />
                        {failed && <span className="ml-2 text-xs font-medium text-red-600">Below pass</span>}
                      </td>
                      <td className="px-4 py-2.5"><input type="checkbox" aria-label="Absent" disabled={locked} checked={entry.absent} onChange={(e) => setEntries((m) => ({ ...m, [s.id]: { ...entry, absent: e.target.checked, marks: e.target.checked ? "" : entry.marks } }))} /></td>
                      <td className="px-4 py-2.5"><input className="input !py-1.5" aria-label="Remarks" maxLength={200} disabled={locked} value={entry.remarks} onChange={(e) => setEntries((m) => ({ ...m, [s.id]: { ...entry, remarks: e.target.value } }))} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {students.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="text-xs text-slate-500">{filled} of {students.length} filled</span>
              <button className="btn-primary" disabled={saving || locked || !filled} onClick={save}>{saving ? <><Spinner className="mr-2" />Saving…</> : "Save marks"}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
