"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { streClassLabel } from "@/lib/stre";
import type { Row } from "@/lib/types";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

type ResultRow = { registration: string; roll_no: string; full_name: string; class_level: string; school_name: string; subject: string; marks: number | null; is_absent: boolean; rank: number | null; award: string };
type Data = {
  exam: { id: string; title: string; total_marks: number; merit_count: number; results_published: boolean; results_published_at: string | null };
  summary: { candidates: number; entered: number; pending: number; absent: number };
  rows: ResultRow[];
};
type RowError = { line: number; roll_no: string; error: string };

export default function StreResultsPage() {
  const [exams, setExams] = useState<Row[]>([]);
  const [exam, setExam] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<RowError[]>([]);
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ results?: Row[] } | Row[]>("/stre/admin/exams/?page_size=50").then((d) => {
      const list = Array.isArray(d) ? d : d.results ?? [];
      setExams(list);
      if (list.length) setExam(list[0].id);
    }).catch(() => toast.error("Could not load exams."));
  }, []);

  const load = useCallback(async () => {
    if (!exam) return;
    try {
      const d = await api<Data>(`/stre/admin/results/?exam=${exam}`);
      setData(d);
      setEdits({});
      setErrors([]);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load results.");
    }
  }, [exam]);
  useEffect(() => { void load(); }, [load]);

  const valueOf = (r: ResultRow) => edits[r.roll_no] ?? (r.is_absent ? "AB" : r.marks == null ? "" : String(r.marks));
  const dirty = Object.keys(edits).length;

  const save = async () => {
    setBusy("save");
    setErrors([]);
    try {
      const rows = Object.entries(edits).map(([roll_no, v]) => ({ roll_no, marks: v.trim() }));
      const res = await api<{ detail: string }>("/stre/admin/results/save/", { method: "POST", silent: true, body: { exam, rows } });
      toast.success(res.detail);
      await load();
    } catch (e) {
      const d = e instanceof ApiError ? (e.data as { detail?: string; errors?: RowError[] }) : undefined;
      if (d?.errors) setErrors(d.errors);
      toast.error(d?.detail ?? "Could not save marks.");
    } finally {
      setBusy("");
    }
  };

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("exam", exam);
    form.append("file", file);
    setBusy("upload");
    setErrors([]);
    try {
      const res = await api<{ detail: string }>("/stre/admin/results/upload/", { method: "POST", silent: true, body: form });
      toast.success(res.detail);
      await load();
    } catch (e) {
      const d = e instanceof ApiError ? (e.data as { detail?: string; errors?: RowError[]; file?: string }) : undefined;
      if (d?.errors) setErrors(d.errors);
      toast.error(d?.detail ?? (e instanceof ApiError ? e.message.replace(/^file:\s*/, "") : "Upload failed."));
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const publish = async (on: boolean) => {
    if (dirty) { toast.error("Save your changes first."); return; }
    const msg = on
      ? `Turn the result ON for ${data?.exam.title}? It will show on the website and candidates can download certificates.${sendEmail ? "\nEvery candidate will also get a result email." : ""}`
      : "Turn the result OFF? It will be hidden from the website (the Result button disappears).";
    if (!window.confirm(msg)) return;
    setBusy("publish");
    try {
      const res = await api<{ detail: string }>("/stre/admin/results/publish/", { method: "POST", silent: true, body: { exam, publish: on, email: on && sendEmail } });
      toast.success(res.detail);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message.replace(/^detail:\s*/, "") : "Could not update.");
    } finally {
      setBusy("");
    }
  };

  const rows = (data?.rows ?? []).filter((r) => !search || `${r.roll_no} ${r.full_name} ${r.school_name}`.toLowerCase().includes(search.toLowerCase()));
  const published = data?.exam.results_published;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">STRE</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Results &amp; Merit List</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">Enter marks (or upload Excel), then publish. Ranks are calculated automatically and every candidate gets a result email with a certificate.</p>
        </div>
        <label className="text-xs font-medium text-slate-600">Exam
          <select className="input mt-1.5 min-w-[220px]" value={exam} onChange={(e) => setExam(e.target.value)}>
            {exams.map((x) => <option key={x.id} value={x.id}>{x.title} ({x.code})</option>)}
          </select>
        </label>
      </div>

      {data && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[["Candidates", data.summary.candidates], ["Marks entered", data.summary.entered], ["Pending", data.summary.pending], ["Absent", data.summary.absent], ["Out of", data.exam.total_marks]].map(([k, v]) => (
              <div key={String(k)} className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm"><span className="block text-[11px] text-slate-500">{k}</span><span className="mt-1 block text-xl font-semibold text-slate-900">{v}</span></div>
            ))}
          </section>

          <section className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center ${published ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
            <button
              type="button" role="switch" aria-checked={!!published} aria-label="Show result on website"
              disabled={!!busy} onClick={() => void publish(!published)}
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition ${published ? "bg-emerald-500" : "bg-slate-300"} disabled:opacity-60`}
            >
              <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition ${published ? "translate-x-7" : "translate-x-1"}`} />
            </button>
            <div className="flex-1 text-sm">
              <b className="block text-slate-900">Result on website: {busy === "publish" ? "updating…" : published ? "ON" : "OFF"}</b>
              <span className="text-xs text-slate-600">{published
                ? "Candidates can see marks and rank, and download certificates. The “Result” button shows on STRE pages and the homepage ticker. Turn OFF to hide it again."
                : `Hidden from everyone. Enter marks, then switch ON to show the result. Top ${data.exam.merit_count} ranks get a Certificate of Merit, others who appeared get Participation.`}</span>
            </div>
            {!published && <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />Email result to all when switching ON</label>}
          </section>

          <section className="flex flex-wrap items-center gap-2">
            <a className="btn-ghost !py-2 text-xs" href={`/api/v1/stre/admin/results/template/?exam=${exam}`}><Icon name="download" size={14} className="mr-1.5" />Marks sheet (Excel)</a>
            <label className={`btn-ghost cursor-pointer !py-2 text-xs ${busy ? "pointer-events-none opacity-60" : ""}`}>
              {busy === "upload" ? <Spinner /> : <><Icon name="download" size={14} className="mr-1.5 rotate-180" />Upload filled sheet</>}
              <input ref={fileRef} type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            </label>
            <a className="btn-ghost !py-2 text-xs" href={`/api/v1/stre/admin/results/export/?exam=${exam}`}><Icon name="download" size={14} className="mr-1.5" />Merit list (CSV)</a>
            <input className="input ml-auto !py-2 text-sm sm:max-w-xs" placeholder="Search roll no, name, school" value={search} onChange={(e) => setSearch(e.target.value)} />
          </section>

          {errors.length > 0 && (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <b>Nothing was saved. Fix these rows:</b>
              <ul className="mt-2 max-h-48 list-disc space-y-0.5 overflow-auto pl-5 text-xs">{errors.map((er, i) => <li key={i}>Row {er.line} · {er.roll_no || "—"}: {er.error}</li>)}</ul>
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <tr><th className="px-4 py-2.5">Rank</th><th className="px-4 py-2.5">Roll no</th><th className="px-4 py-2.5">Candidate</th><th className="px-4 py-2.5">Marks / {data.exam.total_marks}</th><th className="px-4 py-2.5">Certificate</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-slate-400">{data.rows.length ? "No match." : "No candidates with an admit card for this exam yet."}</td></tr>}
                  {rows.map((r) => (
                    <tr key={r.registration} className={edits[r.roll_no] !== undefined ? "bg-indigo-50/60" : ""}>
                      <td className="px-4 py-2 font-semibold text-slate-900">{r.rank ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-slate-700">{r.roll_no}</td>
                      <td className="px-4 py-2"><span className="font-medium text-slate-900">{r.full_name}</span><span className="block text-xs text-slate-500">{r.class_level ? `${streClassLabel(r.class_level)} · ` : ""}{r.school_name}</span></td>
                      <td className="px-4 py-2">
                        <input aria-label={`Marks for ${r.full_name}`} className="input w-24 !py-1.5 text-center font-mono" placeholder="—" maxLength={6} value={valueOf(r)} onChange={(e) => setEdits((x) => ({ ...x, [r.roll_no]: e.target.value.toUpperCase().replace(/[^0-9.AB]/g, "") }))} />
                      </td>
                      <td className="px-4 py-2 text-xs">{r.award ? <span className={`status-pill ${r.award.includes("Merit") ? "status-pill--amber" : "status-pill--indigo"}`}>{r.award.replace("Certificate of ", "")}</span> : r.is_absent ? <span className="status-pill status-pill--slate">Absent</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-600">Type marks, or <b>AB</b> for absent. {dirty ? `${dirty} unsaved change(s).` : ""}</p>
              <div className="flex gap-2">
                {dirty > 0 && <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => { setEdits({}); setErrors([]); }}>Discard</button>}
                <button type="button" className="btn-primary" disabled={!dirty || !!busy} onClick={() => void save()}>{busy === "save" ? <><Spinner className="mr-2" />Saving…</> : "Save marks"}</button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
