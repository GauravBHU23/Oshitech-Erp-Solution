"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToastMessage } from "@/lib/toast";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Paginated, Row } from "@/lib/types";
import Spinner from "@/components/Spinner";

type Status = "present" | "absent" | "late" | "leave";
const STATUSES: { value: Status; label: string; short: string }[] = [
  { value: "present", label: "Present", short: "P" },
  { value: "absent", label: "Absent", short: "A" },
  { value: "late", label: "Late", short: "L" },
  { value: "leave", label: "On leave", short: "LV" },
];
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUSES.map((s) => [s.value, s.label]));

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function Percentage({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  const tone = value >= 75 ? "green" : value >= 60 ? "amber" : "red";
  return <span className={`status-pill status-pill--${tone}`}>{value}%</span>;
}

function StudentAttendance() {
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [records, setRecords] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<Row | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const { from, to } = monthRange(month);
    setRecords(null);
    Promise.all([
      api<Paginated<Row>>(`/attendance/?from=${from}&to=${to}&page_size=200`),
      api<Row[]>(`/attendance/summary/?from=${from}&to=${to}`),
    ])
      .then(([list, sum]) => { setRecords(list.results); setSummary(sum[0] ?? null); setError(""); })
      .catch((e) => { setError(e instanceof ApiError ? e.message : "Unable to load attendance."); setRecords([]); });
  }, [month]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Attendance</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">My Attendance</h1>
          <p className="mt-1.5 text-sm text-slate-500">Your day-by-day attendance as recorded by your class teacher.</p>
        </div>
        <label className="text-xs font-medium text-slate-600">Month<input className="input mt-1.5" type="month" value={month} max={localDate().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[["Attendance", summary ? <Percentage key="p" value={summary.percentage} /> : "—"], ["Present", summary?.present ?? 0], ["Late", summary?.late ?? 0], ["Absent", summary?.absent ?? 0], ["On leave", summary?.leave ?? 0]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
          </div>
        ))}
      </section>
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Remarks</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {records === null && <tr><td colSpan={3} className="px-4 py-6 text-slate-400">Loading…</td></tr>}
            {records?.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-slate-400">No attendance recorded for this month.</td></tr>}
            {records?.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-3">{new Date(`${r.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })}</td>
                <td className="px-4 py-3"><span className={`status-pill status-pill--${r.status === "present" ? "green" : r.status === "absent" ? "red" : r.status === "late" ? "amber" : "slate"}`}>{STATUS_LABEL[r.status]}</span></td>
                <td className="px-4 py-3 text-slate-600">{r.remarks || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StaffAttendance() {
  const [tab, setTab] = useState<"mark" | "summary">("mark");
  const [classrooms, setClassrooms] = useState<Row[]>([]);
  const [classroom, setClassroom] = useState("");
  const [date, setDate] = useState(localDate());
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [students, setStudents] = useState<Row[] | null>(null);
  const [marks, setMarks] = useState<Record<string, { status: Status; remarks: string }>>({});
  const [existing, setExisting] = useState(0);
  const [summary, setSummary] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  useToastMessage(flash, "success");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Paginated<Row>>("/academics/classrooms/?page_size=200")
      .then((d) => { setClassrooms(d.results); if (d.results.length === 1) setClassroom(d.results[0].id); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Unable to load classrooms."));
  }, []);

  const loadDay = useCallback(async () => {
    if (!classroom) { setStudents(null); return; }
    setStudents(null);
    setFlash("");
    try {
      const [list, records] = await Promise.all([
        api<Paginated<Row>>(`/students/?classroom=${classroom}&is_active=true&page_size=200`),
        api<Paginated<Row>>(`/attendance/?classroom=${classroom}&date=${date}&page_size=200`),
      ]);
      const byStudent = Object.fromEntries(records.results.map((r) => [r.student, r]));
      setExisting(records.results.length);
      setMarks(Object.fromEntries(list.results.map((s) => [s.id, { status: (byStudent[s.id]?.status ?? "present") as Status, remarks: byStudent[s.id]?.remarks ?? "" }])));
      setStudents(list.results);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to load students.");
      setStudents([]);
    }
  }, [classroom, date]);

  useEffect(() => { if (tab === "mark") loadDay(); }, [loadDay, tab]);

  useEffect(() => {
    if (tab !== "summary" || !classroom) return;
    const { from, to } = monthRange(month);
    setSummary(null);
    api<Row[]>(`/attendance/summary/?classroom=${classroom}&from=${from}&to=${to}`)
      .then((d) => { setSummary(d); setError(""); })
      .catch((e) => { setError(e instanceof ApiError ? e.message : "Unable to load summary."); setSummary([]); });
  }, [tab, classroom, month]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { present: 0, absent: 0, late: 0, leave: 0 };
    Object.values(marks).forEach((m) => { c[m.status] += 1; });
    return c;
  }, [marks]);

  const setAll = (status: Status) => setMarks((current) => Object.fromEntries(Object.entries(current).map(([id, m]) => [id, { ...m, status }])));

  const save = async () => {
    if (!students?.length) return;
    setSaving(true);
    setFlash("");
    setError("");
    try {
      const res = await api<{ detail: string }>("/attendance/mark/", {
        method: "POST",
        body: { classroom, date, entries: students.map((s) => ({ student: s.id, status: marks[s.id].status, remarks: marks[s.id].remarks })) },
      });
      setFlash(res.detail);
      setExisting(students.length);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to save attendance.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Daily register</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Attendance</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">Mark daily attendance for a class and review monthly attendance percentages.</p>
        </div>
        <div className="segmented" role="tablist" aria-label="Attendance view">
          <button role="tab" aria-selected={tab === "mark"} className={tab === "mark" ? "is-active" : ""} onClick={() => setTab("mark")}>Mark</button>
          <button role="tab" aria-selected={tab === "summary"} className={tab === "summary" ? "is-active" : ""} onClick={() => setTab("summary")}>Monthly summary</button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <label className="min-w-[220px] flex-1 text-xs font-medium text-slate-600">Classroom
          <select className="input mt-1.5" value={classroom} onChange={(e) => setClassroom(e.target.value)}>
            <option value="">Select a classroom…</option>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        {tab === "mark" ? (
          <label className="text-xs font-medium text-slate-600">Date<input className="input mt-1.5" type="date" value={date} max={localDate()} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        ) : (
          <label className="text-xs font-medium text-slate-600">Month<input className="input mt-1.5" type="month" value={month} max={localDate().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
        )}
      </div>

      {flash && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{flash}</div>}
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {classrooms.length === 0 && !error && <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">No classrooms are available to you yet.</p>}
      {!classroom && classrooms.length > 0 && <p className="text-sm text-slate-500">Select a classroom to continue.</p>}

      {tab === "mark" && classroom && (
        <>
          {students && students.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="status-pill status-pill--green">Present {counts.present}</span>
              <span className="status-pill status-pill--red">Absent {counts.absent}</span>
              <span className="status-pill status-pill--amber">Late {counts.late}</span>
              <span className="status-pill status-pill--slate">Leave {counts.leave}</span>
              {existing > 0 && <span className="text-slate-500">Already recorded for this date. Saving will update it.</span>}
              <span className="ml-auto flex gap-2">
                <button className="btn-ghost !py-1.5 text-xs" onClick={() => setAll("present")}>All present</button>
                <button className="btn-ghost !py-1.5 text-xs" onClick={() => setAll("absent")}>All absent</button>
              </span>
            </div>
          )}
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Roll</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Remarks</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {students === null && <tr><td colSpan={4} className="px-4 py-6 text-slate-400">Loading…</td></tr>}
                {students?.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-slate-400">No active students are placed in this classroom.</td></tr>}
                {students?.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{s.roll_no || "—"}</td>
                    <td className="px-4 py-2.5"><div className="font-medium text-slate-800">{`${s.user?.first_name ?? ""} ${s.user?.last_name ?? ""}`.trim()}</div><div className="text-xs text-slate-400">{s.admission_no}</div></td>
                    <td className="px-4 py-2.5">
                      <div className="attendance-toggle" role="radiogroup" aria-label={`Status for ${s.user?.first_name ?? "student"}`}>
                        {STATUSES.map((st) => (
                          <button key={st.value} type="button" role="radio" aria-checked={marks[s.id]?.status === st.value} title={st.label} className={`attendance-toggle__btn attendance-toggle__btn--${st.value} ${marks[s.id]?.status === st.value ? "is-active" : ""}`} onClick={() => setMarks((m) => ({ ...m, [s.id]: { ...m[s.id], status: st.value } }))}>{st.short}</button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><input className="input !py-1.5" aria-label="Remarks" maxLength={200} value={marks[s.id]?.remarks ?? ""} onChange={(e) => setMarks((m) => ({ ...m, [s.id]: { ...m[s.id], remarks: e.target.value } }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {students && students.length > 0 && (
            <div className="flex justify-end">
              <button className="btn-primary" disabled={saving} onClick={save}>{saving ? <><Spinner className="mr-2" />Saving…</> : `Save attendance (${students.length})`}</button>
            </div>
          )}
        </>
      )}

      {tab === "summary" && classroom && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Present</th><th className="px-4 py-3">Late</th><th className="px-4 py-3">Absent</th><th className="px-4 py-3">Leave</th><th className="px-4 py-3">Days</th><th className="px-4 py-3">Attendance</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {summary === null && <tr><td colSpan={7} className="px-4 py-6 text-slate-400">Loading…</td></tr>}
              {summary?.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-slate-400">No students in this classroom.</td></tr>}
              {summary?.map((r) => (
                <tr key={r.student}>
                  <td className="px-4 py-2.5"><div className="font-medium text-slate-800">{r.student_name}</div><div className="text-xs text-slate-400">{r.admission_no}</div></td>
                  <td className="px-4 py-2.5">{r.present}</td><td className="px-4 py-2.5">{r.late}</td><td className="px-4 py-2.5">{r.absent}</td><td className="px-4 py-2.5">{r.leave}</td><td className="px-4 py-2.5">{r.total}</td>
                  <td className="px-4 py-2.5"><Percentage value={r.percentage} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AttendancePage() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "student" ? <StudentAttendance /> : <StaffAttendance />;
}
