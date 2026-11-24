"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CLASS_LEVELS } from "@/lib/resources";
import { toast } from "@/lib/toast";
import type { Paginated, Row } from "@/lib/types";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

type Act = "promote" | "detain" | "pass_out";
const ACT_LABEL: Record<Act, string> = { promote: "Promote", detain: "Detain (repeat)", pass_out: "Passed out / Left" };

/** Saare pages laata hai (API max 200 per page). */
async function fetchAll(path: string): Promise<Row[]> {
  const rows: Row[] = [];
  let url: string | null = `${path}${path.includes("?") ? "&" : "?"}page_size=200`;
  for (let i = 0; url && i < 20; i += 1) {
    const page: Paginated<Row> = await api<Paginated<Row>>(url);
    rows.push(...page.results);
    url = page.next ? page.next.replace(/^.*\/api\/v1/, "") : null;
  }
  return rows;
}

const courseLevel = (room: Row) => String(room.course_name || "").toLowerCase().replace("class", "").trim();

function Select({ label, value, onChange, children, hint }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <select className="input mt-1.5" value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export default function PromotionPage() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const [schools, setSchools] = useState<Row[]>([]);
  const [school, setSchool] = useState("");
  const [years, setYears] = useState<Row[]>([]);
  const [rooms, setRooms] = useState<Row[]>([]);
  const [level, setLevel] = useState("");
  const [fromRoom, setFromRoom] = useState("");
  const [targetYear, setTargetYear] = useState("");
  const [toRoom, setToRoom] = useState("");
  const [detainRoom, setDetainRoom] = useState("");
  const [students, setStudents] = useState<Row[] | null>(null);
  const [picked, setPicked] = useState<Record<string, Act | "">>({});
  const [resetRoll, setResetRoll] = useState(true);
  const [renewCards, setRenewCards] = useState(true);
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Row[]>([]);
  const [error, setError] = useState("");

  const inSchool = useCallback((r: Row) => !isSuper || !school || r.school === school, [isSuper, school]);

  const loadHistory = useCallback(() => {
    api<Row[]>(`/students/promotions/${isSuper && school ? `?school=${school}` : ""}`).then(setHistory).catch(() => setHistory([]));
  }, [isSuper, school]);

  useEffect(() => {
    Promise.all([fetchAll("/academics/academic-years/"), fetchAll("/academics/classrooms/"), isSuper ? fetchAll("/schools/") : Promise.resolve([])])
      .then(([y, r, s]) => { setYears(y); setRooms(r); setSchools(s); if (s.length === 1) setSchool(s[0].id); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Unable to load sessions and classrooms."));
  }, [isSuper]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const schoolYears = useMemo(() => years.filter(inSchool), [years, inSchool]);
  const currentYear = schoolYears.find((y) => y.is_current);
  // Naya session default: current se baad wala sabse pehla
  useEffect(() => {
    if (targetYear && schoolYears.some((y) => y.id === targetYear)) return;
    const later = schoolYears.filter((y) => !currentYear || y.start_date > currentYear.start_date).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
    setTargetYear(later[0]?.id ?? "");
  }, [schoolYears, currentYear, targetYear]);

  const next = level ? String(Number(level) + 1) : "";
  const fromRooms = rooms.filter((r) => inSchool(r) && courseLevel(r) === level);
  const toRooms = rooms.filter((r) => inSchool(r) && r.academic_year === targetYear && courseLevel(r) === next);
  const detainRooms = rooms.filter((r) => inSchool(r) && r.academic_year === targetYear && courseLevel(r) === level);

  const loadStudents = useCallback(async () => {
    if (!level || (isSuper && !school)) { setStudents(null); return; }
    setStudents(null);
    try {
      const rows = (await fetchAll(`/students/?class_level=${level}&is_active=true${fromRoom ? `&classroom=${fromRoom}` : ""}`)).filter(inSchool);
      setStudents(rows);
      setPicked(Object.fromEntries(rows.map((s) => [s.id, level === "12" ? "pass_out" : "promote"])));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to load students.");
      setStudents([]);
    }
  }, [level, fromRoom, isSuper, school, inSchool]);
  useEffect(() => { void loadStudents(); }, [loadStudents]);
  useEffect(() => { setToRoom(""); setDetainRoom(""); }, [level, targetYear]);

  const chosen = Object.entries(picked).filter(([, a]) => a) as [string, Act][];
  const count = (a: Act) => chosen.filter(([, x]) => x === a).length;
  const setAll = (a: Act | "") => setPicked(Object.fromEntries((students ?? []).map((s) => [s.id, a])));
  const target = schoolYears.find((y) => y.id === targetYear);

  const submit = async () => {
    if (!chosen.length) { toast.error("Select at least one student."); return; }
    if (!targetYear) { toast.error("Select the new session first."); return; }
    const lines = [
      `Move Class ${level} students to session ${target?.name}?`,
      count("promote") ? `• ${count("promote")} promoted to Class ${next}` : "",
      count("detain") ? `• ${count("detain")} detained in Class ${level}` : "",
      count("pass_out") ? `• ${count("pass_out")} marked passed out (their ID cards stop working)` : "",
      "You can undo this from Recent promotions.",
    ].filter(Boolean);
    if (!window.confirm(lines.join("\n"))) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ detail: string }>("/students/promote/", {
        method: "POST", silent: true,
        body: {
          ...(isSuper ? { school } : {}), from_class_level: level, from_classroom: fromRoom || undefined, target_year: targetYear,
          to_classroom: toRoom || undefined, detain_classroom: detainRoom || undefined,
          reset_roll_no: resetRoll, renew_id_cards: renewCards, make_year_current: makeCurrent,
          decisions: chosen.map(([student, action]) => ({ student, action })),
        },
      });
      toast.success(res.detail);
      if (makeCurrent) setYears((ys) => ys.map((y) => (inSchool(y) ? { ...y, is_current: y.id === targetYear } : y)));
      await loadStudents();
      loadHistory();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message.replace(/^\w+:\s*/, "") : "Promotion failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const undo = async (batch: string) => {
    if (!window.confirm("Undo this promotion? Students go back to their previous class, section and roll number.")) return;
    try {
      const res = await api<{ detail: string }>("/students/undo-promotion/", { method: "POST", silent: true, body: { batch, ...(isSuper ? { school } : {}) } });
      toast.success(res.detail);
      await loadStudents();
      loadHistory();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message.replace(/^\w+:\s*/, "") : "Could not undo.");
    }
  };

  const noLaterYear = schoolYears.length > 0 && !schoolYears.some((y) => !currentYear || y.start_date > currentYear.start_date);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Academics</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Promote Students</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-500">Move a whole class to the next class and new session in one step. Choose for each student: promote, detain (repeat the class) or passed out.</p>
      </div>

      {noLaterYear && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Icon name="calendar" size={18} />
          <span className="flex-1">Create the next academic year (e.g. {currentYear ? nextYearName(currentYear.name) : "2027-28"}) and its classrooms first.</span>
          <Link href="/manage/academic-years" className="btn-ghost !py-2 text-xs">Academic Years</Link>
          <Link href="/manage/classrooms" className="btn-ghost !py-2 text-xs">Classrooms</Link>
        </div>
      )}
      {error && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="grid gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
        {isSuper && (
          <Select label="School *" value={school} onChange={(v) => { setSchool(v); setLevel(""); setTargetYear(""); }}>
            <option value="">Select school</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
        <Select label="Current class *" value={level} onChange={(v) => { setLevel(v); setFromRoom(""); }}>
          <option value="">Select class</option>
          {CLASS_LEVELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Select label="Current section" value={fromRoom} onChange={setFromRoom} hint="Leave as “All sections” to load the whole class.">
          <option value="">All sections</option>
          {fromRooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </Select>
        <Select label="New session *" value={targetYear} onChange={setTargetYear}>
          <option value="">Select session</option>
          {schoolYears.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? " (current)" : ""}</option>)}
        </Select>
        {level !== "12" && (
          <Select label={`Promote to (Class ${next || "—"} section)`} value={toRoom} onChange={setToRoom} hint={level && targetYear && !toRooms.length ? `No Class ${next} classroom in this session yet — students move without a section.` : "Optional. You can assign sections later."}>
            <option value="">No section yet</option>
            {toRooms.map((r) => <option key={r.id} value={r.id}>{r.label} · {r.student_count ?? 0}/{r.capacity}</option>)}
          </Select>
        )}
        <Select label={`Detained students (Class ${level || "—"} section)`} value={detainRoom} onChange={setDetainRoom} hint="Optional section for students who repeat the class.">
          <option value="">No section yet</option>
          {detainRooms.map((r) => <option key={r.id} value={r.id}>{r.label} · {r.student_count ?? 0}/{r.capacity}</option>)}
        </Select>
        <div className="space-y-2 text-sm text-slate-700 sm:col-span-2 lg:col-span-3">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={resetRoll} onChange={(e) => setResetRoll(e.target.checked)} />Clear roll numbers (new roll numbers are given in the new class)</label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={renewCards} onChange={(e) => setRenewCards(e.target.checked)} />Extend ID cards till the end of the new session{target ? ` (${target.end_date})` : ""}</label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} />Make {target?.name ?? "the new session"} the current academic year</label>
        </div>
      </section>

      {level && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="mr-auto text-sm font-semibold text-slate-900">Class {level} students {students ? `(${students.length})` : ""}</h2>
            <span className="text-xs text-slate-500">Set all:</span>
            {level !== "12" && <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setAll("promote")}>Promote</button>}
            <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setAll("detain")}>Detain</button>
            <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setAll("pass_out")}>Passed out</button>
            <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setAll("")}>Skip all</button>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Section</th><th className="px-4 py-3">Roll</th><th className="px-4 py-3">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students === null && <tr><td colSpan={4} className="px-4 py-6 text-slate-400"><Spinner className="mr-2" />Loading…</td></tr>}
                {students?.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-slate-400">No active students in Class {level}{fromRoom ? " (this section)" : ""}.</td></tr>}
                {students?.map((s) => (
                  <tr key={s.id} className={picked[s.id] ? "" : "opacity-60"}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{s.label}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.classroom_name || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.roll_no || "—"}</td>
                    <td className="px-4 py-2">
                      <select aria-label={`Action for ${s.label}`} className="input !py-1.5 text-xs" value={picked[s.id] ?? ""} onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.value as Act | "" }))}>
                        <option value="">Skip (no change)</option>
                        {(Object.keys(ACT_LABEL) as Act[]).filter((a) => !(level === "12" && a === "promote")).map((a) => <option key={a} value={a}>{ACT_LABEL[a]}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-600">{count("promote")} promote · {count("detain")} detain · {count("pass_out")} passed out · {(students?.length ?? 0) - chosen.length} skipped</p>
            <button type="button" className="btn-primary !py-2.5" disabled={busy || !chosen.length || !targetYear} onClick={() => void submit()}>
              {busy ? <><Spinner className="mr-2" />Saving…</> : <><Icon name="arrow" size={15} className="mr-2" />Apply to {chosen.length} student{chosen.length === 1 ? "" : "s"}</>}
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Recent promotions</h2>
        {!history.length && <p className="mt-2 text-sm text-slate-400">No promotions yet.</p>}
        <ul className="mt-3 divide-y divide-slate-100">
          {history.map((h) => (
            <li key={h.batch} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">Class {h.from_class_level} → {h.year} {h.undone && <span className="status-pill status-pill--slate ml-2">Undone</span>}</p>
                <p className="text-xs text-slate-500">{h.promoted} promoted · {h.detained} detained · {h.passed_out} passed out · {new Date(h.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{h.by ? ` · ${h.by}` : ""}</p>
              </div>
              {!h.undone && <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => void undo(h.batch)}>Undo</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function nextYearName(name: string) {
  const m = /^(\d{4})/.exec(name);
  if (!m) return "next session";
  const y = Number(m[1]) + 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}
