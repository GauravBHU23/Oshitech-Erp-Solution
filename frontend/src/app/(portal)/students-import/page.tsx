"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import type { Paginated, Row } from "@/lib/types";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

type RowError = { row: number; admission_no: string; name: string; errors: Record<string, string> };
type Check = { total: number; valid: number; invalid: number; errors: RowError[]; preview: Row[] };
type Job = { id: string; status: "running" | "done" | "failed"; total: number; done: number; error: string; credentials_available: boolean; created: number };

const FIELD_LABEL: Record<string, string> = {
  first_name: "First name", last_name: "Last name", admission_no: "Admission no", class_level: "Class", section: "Section", roll_no: "Roll no",
  date_of_birth: "Date of birth", gender: "Gender", father_name: "Father name", mother_name: "Mother name", guardian_phone: "Parent phone",
  email: "Email", password: "Password", blood_group: "Blood group", address: "Address", classroom: "Section", row: "Row",
};

export default function StudentsImportPage() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const [schools, setSchools] = useState<Row[]>([]);
  const [school, setSchool] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState<"" | "check" | "import">("");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSuper) api<Paginated<Row>>("/schools/?page_size=200").then((d) => { setSchools(d.results); if (d.results.length === 1) setSchool(d.results[0].id); }).catch(() => {});
  }, [isSuper]);

  // Background import ki progress
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const t = window.setTimeout(() => {
      api<Job>(`/students/import-status/?job=${job.id}`).then((j) => {
        setJob(j);
        if (j.status === "done") toast.success(`${j.created} students admitted. Download their login details now.`);
        if (j.status === "failed") toast.error(j.error);
      }).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(t);
  }, [job]);

  const send = async (dryRun: boolean) => {
    if (!file) { setError("Choose the filled Excel or CSV file first."); return; }
    if (isSuper && !school) { setError("Select the school first."); return; }
    const form = new FormData();
    form.append("file", file);
    form.append("dry_run", dryRun ? "true" : "false");
    if (isSuper) form.append("school", school);
    setBusy(dryRun ? "check" : "import");
    setError("");
    try {
      const res = await api<Check & { job?: Job }>("/students/import/", { method: "POST", body: form, silent: true });
      setCheck(res);
      if (res.job) setJob(res.job);
      else if (res.invalid) toast.error(`${res.invalid} row(s) need fixing.`);
      else toast.success(`All ${res.valid} rows look good. Click “Import” to admit them.`);
    } catch (e) {
      if (e instanceof ApiError && e.data && typeof e.data === "object" && "errors" in (e.data as object)) {
        const data = e.data as Check & { detail?: string };
        setCheck(data);
        toast.error(data.detail ?? "Some rows need fixing.");
      } else {
        const msg = e instanceof ApiError ? e.message.replace(/^\w+:\s*/, "") : "Upload failed.";
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setBusy("");
    }
  };

  const reset = () => { setFile(null); setCheck(null); setJob(null); setError(""); if (input.current) input.current.value = ""; };
  const pct = job ? Math.round((job.done / Math.max(job.total, 1)) * 100) : 0;
  const schoolQs = isSuper && school ? `&school=${school}` : "";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">School &amp; People</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Import Students</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-500">Admit many students at once from Excel or CSV. Every student gets a login and an ID card automatically.</p>
      </div>

      <ol className="grid gap-3 md:grid-cols-3">
        <li className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Step 1</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Download the template</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Fill one student per row. Blue columns are required. Delete the example rows.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn-primary !py-2 text-xs" href={`/api/v1/students/import-template/?type=xlsx${schoolQs}`}><Icon name="download" size={14} className="mr-1.5" />Excel template</a>
            <a className="btn-ghost !py-2 text-xs" href={`/api/v1/students/import-template/?type=csv${schoolQs}`}>CSV</a>
          </div>
        </li>
        <li className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Step 2</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Upload &amp; check</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">We check every row first and show exactly what to fix. Nothing is saved until all rows are correct.</p>
        </li>
        <li className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Step 3</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Import &amp; share logins</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Download the login list (email + temporary password) and share it with students. It is available for 24 hours.</p>
        </li>
      </ol>

      {!job && (
        <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          {isSuper && (
            <label className="block max-w-sm text-xs font-medium text-slate-600">School *
              <select className="input mt-1.5" value={school} onChange={(e) => { setSchool(e.target.value); setCheck(null); }}>
                <option value="">Select school</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition hover:border-indigo-300">
            <Icon name="download" size={26} className="rotate-180 text-indigo-600" />
            <span className="text-sm font-semibold text-slate-800">{file ? file.name : "Choose Excel (.xlsx) or CSV file"}</span>
            <span className="text-xs text-slate-500">{file ? `${(file.size / 1024).toFixed(0)} KB · click to change` : "Up to 2000 students · max 5 MB"}</span>
            <input ref={input} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setCheck(null); setError(""); }} />
          </label>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" disabled={!!busy || !file} onClick={() => void send(true)}>{busy === "check" ? <><Spinner className="mr-2" />Checking…</> : "Check file"}</button>
            <button type="button" className="btn-primary" disabled={!!busy || !check || check.invalid > 0 || check.valid === 0} onClick={() => void send(false)}>
              {busy === "import" ? <><Spinner className="mr-2" />Starting…</> : `Import ${check?.valid ?? ""} students`}
            </button>
          </div>
        </section>
      )}

      {job && (
        <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          {job.status === "running" && (
            <>
              <p className="text-sm font-semibold text-slate-900"><Spinner className="mr-2" />Creating student accounts… {job.done}/{job.total}</p>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} /></div>
              <p className="text-xs text-slate-500">You can stay on this page. Large files take a few minutes.</p>
            </>
          )}
          {job.status === "done" && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon name="check" size={24} /></span>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">{job.created} students admitted</p>
                <p className="text-xs text-slate-500">ID cards were issued automatically. Download the login list now — passwords cannot be shown again after 24 hours.</p>
              </div>
              {job.credentials_available && <a className="btn-primary" href={`/api/v1/students/import-credentials/?job=${job.id}`}><Icon name="download" size={15} className="mr-2" />Download logins (CSV)</a>}
            </div>
          )}
          {job.status === "failed" && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{job.error}</p>}
          {job.status !== "running" && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" onClick={reset}>Import another file</button>
              <Link href="/manage/students" className="btn-ghost">View students</Link>
              <Link href="/id-cards" className="btn-ghost">ID cards</Link>
            </div>
          )}
        </section>
      )}

      {check && !job && (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3 text-sm">
            <span className="mr-auto font-semibold text-slate-900">Check result</span>
            <span className="status-pill status-pill--slate">{check.total} rows</span>
            <span className="status-pill status-pill--green">{check.valid} ready</span>
            {check.invalid > 0 && <span className="status-pill status-pill--red">{check.invalid} to fix</span>}
          </div>
          {check.errors.length > 0 ? (
            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-2.5">Row</th><th className="px-4 py-2.5">Student</th><th className="px-4 py-2.5">What to fix</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {check.errors.map((r) => (
                    <tr key={r.row} className="align-top">
                      <td className="px-4 py-2.5 font-mono text-slate-700">{r.row}</td>
                      <td className="px-4 py-2.5 text-slate-800">{r.name || "—"}<span className="block text-xs text-slate-500">{r.admission_no}</span></td>
                      <td className="px-4 py-2.5"><ul className="space-y-0.5 text-xs text-red-700">{Object.entries(r.errors).map(([k, msg]) => <li key={k}><b>{FIELD_LABEL[k] ?? k}:</b> {msg}</li>)}</ul></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {check.invalid > check.errors.length && <p className="px-4 py-2 text-xs text-slate-500">Showing the first {check.errors.length} problems.</p>}
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-2.5">Row</th><th className="px-4 py-2.5">Adm. no</th><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Class</th><th className="px-4 py-2.5">Login email</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {check.preview.map((p) => (
                    <tr key={p.row}><td className="px-4 py-2 font-mono">{p.row}</td><td className="px-4 py-2">{p.admission_no}</td><td className="px-4 py-2">{p.name}</td><td className="px-4 py-2">Class {p.class_level}{p.section ? ` - ${p.section}` : ""}</td><td className="px-4 py-2 text-xs text-slate-600">{p.email}</td></tr>
                  ))}
                </tbody>
              </table>
              {check.valid > check.preview.length && <p className="px-4 py-2 text-xs text-slate-500">…and {check.valid - check.preview.length} more.</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
