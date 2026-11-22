"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ACTION_LABELS, MODEL_LABELS, actionLabel, actionTone, changeLines, modelLabel } from "@/lib/audit";
import type { Paginated, Row } from "@/lib/types";
import { ROLE_LABEL, type Role } from "@/lib/types";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

const PAGE_SIZE = 25;

function when(value: string) {
  const d = new Date(value);
  return {
    date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
  };
}

function Who({ row }: { row: Row }) {
  const name = row.user_name || row.user_email || "System";
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium text-slate-800">{name}</span>
      <span className="block truncate text-xs text-slate-500">
        {row.user_name && row.user_email ? row.user_email : ""}
        {row.user_role ? `${row.user_name && row.user_email ? " · " : ""}${ROLE_LABEL[row.user_role as Role] ?? row.user_role}` : ""}
      </span>
    </span>
  );
}

function Changes({ row }: { row: Row }) {
  const lines = changeLines(row.changes);
  if (!lines.length) return <span className="text-slate-400">—</span>;
  return (
    <ul className="space-y-0.5">
      {lines.slice(0, 4).map((line) => <li key={line} className="break-words">{line}</li>)}
      {lines.length > 4 && <li className="text-slate-400">+{lines.length - 4} more</li>}
    </ul>
  );
}

export default function AuditLogsPage() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const [data, setData] = useState<Paginated<Row> | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [model, setModel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (action) qs.set("action", action);
    if (model) qs.set("model", model);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (query) qs.set("search", query);
    setData(null);
    try {
      setError("");
      setData(await api<Paginated<Row>>(`/audit-logs/?${qs}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to load the audit log.");
      setData({ count: 0, next: null, previous: null, results: [] });
    }
  }, [page, action, model, from, to, query]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setAction(""); setModel(""); setFrom(""); setTo(""); setSearch(""); setQuery(""); setPage(1); };
  const filtersOn = !!(action || model || from || to || query);
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;
  const rows = data?.results ?? [];

  return (
    <div className="audit-page space-y-5">
      <div className="portal-admin-heading flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Security</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Audit Logs</h1>
            {data && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">{data.count} entries</span>}
          </div>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">Who changed what, and when. Every create, update, delete and important action is recorded here.</p>
        </div>
        <button type="button" className="btn-ghost sm:hidden" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          <Icon name="settings" size={15} className="mr-2" />Filters{filtersOn ? " •" : ""}
        </button>
      </div>

      <form
        className={`audit-filters grid gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:grid sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_.8fr_.8fr_auto] lg:items-end ${showFilters ? "" : "hidden sm:grid"}`}
        onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}
      >
        <label className="text-xs font-medium text-slate-600">Search
          <input className="input mt-1.5" type="search" placeholder="User email, name or IP" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-600">Action
          <select className="input mt-1.5" value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }}>
            <option value="">All actions</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Record type
          <select className="input mt-1.5" value={model} onChange={(e) => { setPage(1); setModel(e.target.value); }}>
            <option value="">All records</option>
            {Object.entries(MODEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">From
          <input className="input mt-1.5" type="date" value={from} max={to || undefined} onChange={(e) => { setPage(1); setFrom(e.target.value); }} />
        </label>
        <label className="text-xs font-medium text-slate-600">To
          <input className="input mt-1.5" type="date" value={to} min={from || undefined} onChange={(e) => { setPage(1); setTo(e.target.value); }} />
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <button className="btn-primary flex-1 lg:flex-none">Search</button>
          {filtersOn && <button type="button" className="btn-ghost flex-1 lg:flex-none" onClick={reset}>Clear</button>}
        </div>
      </form>

      {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Desktop / tablet: table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm md:block">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="w-[130px] px-4 py-3">When</th>
              <th className="w-[220px] px-4 py-3">Who</th>
              <th className="w-[170px] px-4 py-3">Action</th>
              <th className="w-[150px] px-4 py-3">Record</th>
              <th className="px-4 py-3">What changed</th>
              {isSuper && <th className="w-[160px] px-4 py-3">School</th>}
              <th className="w-[120px] px-4 py-3">IP address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {!data && <tr><td colSpan={isSuper ? 7 : 6} className="px-4 py-6 text-slate-400"><Spinner className="mr-2" />Loading…</td></tr>}
            {data && rows.length === 0 && <tr><td colSpan={isSuper ? 7 : 6} className="px-4 py-10 text-center text-slate-500">{filtersOn ? "No activity matches these filters." : "No activity recorded yet."}</td></tr>}
            {rows.map((row) => {
              const t = when(row.created_at);
              return (
                <tr key={row.id} className="hover:bg-indigo-50/30">
                  <td className="whitespace-nowrap px-4 py-3"><span className="block font-medium text-slate-800">{t.date}</span><span className="text-xs text-slate-500">{t.time}</span></td>
                  <td className="max-w-[220px] px-4 py-3"><Who row={row} /></td>
                  <td className="px-4 py-3"><span className={`status-pill status-pill--${actionTone(row.action)}`}>{actionLabel(row.action)}</span></td>
                  <td className="px-4 py-3"><span className="block text-slate-800">{modelLabel(row.model)}</span><span className="font-mono text-[11px] text-slate-400" title={row.object_id}>#{String(row.object_id).slice(0, 8)}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-600"><Changes row={row} /></td>
                  {isSuper && <td className="px-4 py-3 text-xs text-slate-600">{row.school_name || "Platform"}</td>}
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{row.ip_address || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phone: cards */}
      <ul className="space-y-3 md:hidden">
        {!data && <li className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-400"><Spinner className="mr-2" />Loading…</li>}
        {data && rows.length === 0 && <li className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">{filtersOn ? "No activity matches these filters." : "No activity recorded yet."}</li>}
        {rows.map((row) => {
          const t = when(row.created_at);
          return (
            <li key={row.id} className="audit-card rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className={`status-pill status-pill--${actionTone(row.action)}`}>{actionLabel(row.action)}</span>
                <span className="shrink-0 text-right text-[11px] leading-4 text-slate-500">{t.date}<br />{t.time}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-800">{modelLabel(row.model)} <span className="font-mono text-[11px] font-normal text-slate-400">#{String(row.object_id).slice(0, 8)}</span></p>
              <div className="mt-1 text-sm"><Who row={row} /></div>
              {changeLines(row.changes).length > 0 && <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600"><Changes row={row} /></div>}
              <p className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
                {isSuper && <span>{row.school_name || "Platform"}</span>}
                {row.ip_address && <span className="font-mono">IP {row.ip_address}</span>}
              </p>
            </li>
          );
        })}
      </ul>

      {data && data.count > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={!data.previous} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button className="btn-ghost" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
