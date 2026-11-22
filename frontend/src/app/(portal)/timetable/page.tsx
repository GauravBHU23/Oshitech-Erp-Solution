"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Paginated, Row } from "@/lib/types";
import Icon from "@/components/Icon";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function TimetablePage() {
  const { user } = useAuth();
  const role = user?.role;
  const isStudent = role === "student";
  const isTeacher = role === "teacher";
  const isAdmin = role === "school_admin" || role === "super_admin";
  const [classrooms, setClassrooms] = useState<Row[]>([]);
  const [classroom, setClassroom] = useState(isTeacher ? "mine" : "");
  const [entries, setEntries] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const todayIndex = (new Date().getDay() + 6) % 7; // Monday = 0

  useEffect(() => {
    if (isStudent) return;
    api<Paginated<Row>>("/academics/classrooms/?page_size=200")
      .then((d) => { setClassrooms(d.results); if (!isTeacher && d.results.length === 1) setClassroom(d.results[0].id); })
      .catch(() => {});
  }, [isStudent, isTeacher]);

  useEffect(() => {
    if (!isStudent && !classroom) { setEntries(null); return; }
    const qs = isStudent ? "" : classroom === "mine" ? "mine=1&" : `classroom=${classroom}&`;
    setEntries(null);
    api<Paginated<Row>>(`/timetable/?${qs}page_size=200`)
      .then((d) => { setEntries(d.results); setError(""); })
      .catch((e) => { setError(e instanceof ApiError ? e.message : "Unable to load the timetable."); setEntries([]); });
  }, [classroom, isStudent]);

  const periods = useMemo(() => {
    const map = new Map<number, string>();
    (entries ?? []).forEach((e) => { if (!map.has(e.period)) map.set(e.period, `${String(e.start_time).slice(0, 5)}–${String(e.end_time).slice(0, 5)}`); });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [entries]);
  const cell = (day: number, period: number) => (entries ?? []).filter((e) => e.day === day && e.period === period);

  return (
    <div className="admit-card-page space-y-5">
      <div className="no-print flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Academics</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{isStudent ? "My Timetable" : "Weekly Timetable"}</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">Period-wise weekly schedule. Today&apos;s column is highlighted.</p>
        </div>
        {!isStudent && (
          <label className="min-w-[220px] text-xs font-medium text-slate-600">Show
            <select className="input mt-1.5" value={classroom} onChange={(e) => setClassroom(e.target.value)}>
              {isTeacher ? <option value="mine">My teaching schedule</option> : <option value="">Select a classroom…</option>}
              {classrooms.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        )}
        {isAdmin && <Link href="/manage/timetable" className="btn-ghost">Edit timetable</Link>}
        <button className="btn-primary" disabled={!entries?.length} onClick={() => window.print()}><Icon name="printer" size={16} className="mr-2" />Print</button>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {!isStudent && !classroom && <p className="text-sm text-slate-500">Select a classroom to see its timetable.</p>}
      {entries?.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">No timetable has been set up yet.{isAdmin ? " Use “Edit timetable” to add periods." : ""}</p>}
      {entries && entries.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <table className="timetable w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <th className="w-28 px-3 py-3">Period</th>
                {DAYS.map((d, i) => <th key={d} className={`px-3 py-3 ${i === todayIndex ? "timetable-today" : ""}`}>{d}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {periods.map(([period, time]) => (
                <tr key={period}>
                  <td className="px-3 py-3 align-top"><b className="block text-slate-800">P{period}</b><span className="text-slate-400">{time}</span></td>
                  {DAYS.map((d, i) => (
                    <td key={d} className={`px-2 py-2 align-top ${i === todayIndex ? "timetable-today" : ""}`}>
                      {cell(i + 1, period).map((e) => (
                        <div key={e.id} className="timetable-slot">
                          <b className="block">{e.subject_name}</b>
                          <span className="block">{classroom === "mine" ? e.classroom_name : e.teacher_name || "—"}</span>
                          {e.room && <span className="block opacity-70">Room {e.room}</span>}
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
