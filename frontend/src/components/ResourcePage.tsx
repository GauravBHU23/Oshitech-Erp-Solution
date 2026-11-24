"use client";
import { imageErrorMessage, shrinkPhoto } from "@/lib/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Field, FilterDef, Resource, RowAction, ToolbarAction } from "@/lib/resources";
import type { Paginated, Row } from "@/lib/types";
import Modal from "./Modal";
import Spinner from "@/components/Spinner";
import { toast, useToastMessage } from "@/lib/toast";
import { LANDLINE_PATTERN, PHONE_HINT, PHONE_PATTERN, cleanPhone, fieldErrors, readableError } from "@/lib/validation";

type Opt = { value: string; label: string; school?: string };
type Values = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const AUDIT_ACTIONS = [
  ["create", "Created"], ["update", "Updated"], ["delete", "Deleted"],
  ["profile_updated", "Profile updated"], ["registration_submitted", "Registration submitted"],
  ["account_updated", "Account updated"], ["account_deleted", "Account deleted"],
  ["account_blocked", "Login blocked"], ["account_unblocked", "Login unblocked"],
  ["account_password_reset", "Password reset"],
  ["registration_approved", "Registration approved"], ["registration_rejected", "Registration rejected"],
  ["generate_admit_cards", "Admit cards generated"], ["publish_results", "Results published"],
  ["unlock_results", "Results unlocked"], ["revoke_admit_card", "Admit card revoked"],
  ["create_school_admin", "School admin created"], ["create_exam_controller", "Exam controller created"],
  ["teacher_profile_created", "Teacher profile created"],
  ["id_card_reissued", "ID card reissued"], ["id_card_revoked", "ID card revoked"],
  ["attendance_marked", "Attendance marked"], ["seed_classes", "Class 1–12 created"],
] as const;
const AUDIT_COLUMN_WIDTHS: Record<string, string> = { created_at: "w-[14%]", user_email: "w-[20%]", action: "w-[15%]", model: "w-[10%]", object_id: "w-[10%]", changes: "w-[21%]", ip_address: "w-[10%]" };
type ModalState =
  | { kind: "form"; row: Row | null }
  | { kind: "action"; row: Row; action: RowAction }
  | null;

function initialValues(fields: Field[], row: Row | null): Values {
  const v: Values = {};
  for (const f of fields) {
    if (row) {
      if (f.createOnly) {
        if (f.name === "school") v.school = row.school ?? "";
        continue;
      }
      const raw = f.fromUser ? row.user?.[f.name] : row[f.name];
      v[f.name] = f.type === "file" || f.type === "pdf" ? "" : f.type === "checkbox" ? !!raw : raw ?? "";
    } else {
      v[f.name] = f.default ?? (f.type === "checkbox" ? false : "");
    }
  }
  return v;
}

function buildPayload(fields: Field[], values: Values, editing: boolean): Values {
  const p: Values = {};
  for (const f of fields) {
    if (editing && f.createOnly) continue;
    if (!editing && f.editOnly) continue;
    const v = values[f.name];
    if (f.type === "file" || f.type === "pdf") {
      if (v instanceof File) p[f.name] = v;
      continue;
    }
    if (f.type === "checkbox") p[f.name] = !!v;
    else if (v === "" || v === undefined) {
      if (f.required || f.type === "text" || f.type === "textarea" || f.type === "email" || !f.type) {
        if (!(editing && f.type === "password")) p[f.name] = "";
      } else p[f.name] = null; // optional date/number/select khali = null
    } else p[f.name] = f.type === "number" ? Number(v) : v;
  }
  if (Object.values(p).some((value) => value instanceof File)) {
    const form = new FormData();
    Object.entries(p).forEach(([key, value]) => form.append(key, value instanceof File ? value : value == null ? "" : String(value)));
    return form;
  }
  return p;
}

function FieldInput({
  f,
  value,
  onChange,
  options,
  error,
  landline,
}: {
  f: Field;
  value: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  onChange: (v: unknown) => void;
  options: Opt[];
  error?: string;
  landline?: boolean;
}) {
  const id = `field-${f.name}`;
  const errorId = `${id}-error`;
  const aria = { id, name: f.name, "aria-invalid": error ? true : undefined, "aria-describedby": error ? errorId : undefined };
  const message = error ? <span id={errorId} role="alert" className="field-error mt-1 block text-xs font-medium">{error}</span> : null;
  const isPhone = f.name === "phone" || f.name.endsWith("_phone");
  if (f.type === "checkbox")
    return (
      <div className={error ? "has-error" : ""}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} {...aria} />
          {f.label}
        </label>
        {message}
      </div>
    );
  if (f.type === "pdf")
    return (
      <label className={`block text-sm ${error ? "has-error" : ""}`}>
        <span className="mb-1 block font-medium text-slate-600">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
        <input className="input file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700" type="file" accept="application/pdf,.pdf" required={f.required} onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) { onChange(""); return; }
          if (!/\.pdf$/i.test(file.name)) { e.target.value = ""; onChange(""); toast.error("Choose a PDF file (.pdf)."); return; }
          if (file.size > 10 * 1024 * 1024) { e.target.value = ""; onChange(""); toast.error("PDF must be 10 MB or smaller."); return; }
          onChange(file);
        }} {...aria} />
        {message}
      </label>
    );
  if (f.type === "file")
    return (
      <label className={`block text-sm ${error ? "has-error" : ""}`}>
        <span className="mb-1 block font-medium text-slate-600">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
        <input className="input file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700" type="file" accept="image/*" required={f.required} onChange={(e) => { const file = e.target.files?.[0]; if (!file) { onChange(""); return; } shrinkPhoto(file).then((small) => onChange(small)).catch((err) => { e.target.value = ""; onChange(""); toast.error(imageErrorMessage(err)); }); }} {...aria} />
        {message}
      </label>
    );
  return (
    <label className={`block text-sm ${error ? "has-error" : ""}`}>
      <span className="mb-1 block font-medium text-slate-600">
        {f.label}
        {f.required && <span className="text-red-500"> *</span>}
      </span>
      {f.type === "select" ? (
        <select className="input" value={value ?? ""} required={f.required} onChange={(e) => onChange(e.target.value)} {...aria}>
          <option value="">{f.required ? "Select…" : "— none —"}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : f.type === "textarea" ? (
        <textarea className="input" rows={3} value={value ?? ""} required={f.required} maxLength={5000} onChange={(e) => onChange(e.target.value)} {...aria} />
      ) : isPhone ? (
        <input
          className="input"
          type="tel"
          inputMode="tel"
          maxLength={landline ? 16 : 14}
          pattern={landline ? LANDLINE_PATTERN : PHONE_PATTERN}
          title={landline ? "Enter a valid phone number with STD code" : PHONE_HINT}
          placeholder={landline ? "e.g. 0542 2368000" : "9876543210"}
          value={value ?? ""}
          required={f.required}
          autoComplete="off"
          onChange={(e) => onChange(cleanPhone(e.target.value))}
          {...aria}
        />
      ) : (
        <input
          className="input"
          type={f.type ?? "text"}
          value={value ?? ""}
          required={f.required}
          min={f.type === "number" ? 0 : undefined}
          step={f.type === "number" ? "any" : undefined}
          minLength={f.type === "password" ? 10 : undefined}
          title={f.type === "password" ? "At least 10 characters" : undefined}
          autoComplete={f.type === "password" ? "new-password" : "off"}
          onChange={(e) => onChange(e.target.value)}
          {...aria}
        />
      )}
      {!error && isPhone && <span className="mt-1 block text-[11px] text-slate-400">{landline ? "Mobile or landline with STD code" : "10-digit mobile number"}</span>}
      {message}
    </label>
  );
}

export default function ResourcePage({ resource }: { resource: Resource }) {
  const { user, refreshUser } = useAuth();
  const role = user?.role;
  const isAdmin = role === "super_admin" || role === "school_admin";
  const canWrite = !!role && (
    role === "super_admin" ||
    resource.writeRoles.includes(role) ||
    (resource.key === "schools" && role === "school_admin" && !user?.school)
  );
  const canDelete = !!role && canWrite && (!resource.deleteRoles || role === "super_admin" || resource.deleteRoles.includes(role));
  const canCreate = !!role && canWrite && (
    role === "super_admin" ||
    !resource.createRoles ||
    resource.createRoles.includes(role) ||
    (resource.key === "schools" && role === "school_admin" && !user?.school)
  );
  const filterDefs: FilterDef[] = useMemo(() => resource.filters ?? (resource.filter ? [resource.filter] : []), [resource]);
  const toolbarActions: ToolbarAction[] = (resource.toolbarActions ?? []).filter((a) => role && (role === "super_admin" || a.roles.includes(role)));
  const [toolbarBusy, setToolbarBusy] = useState("");

  const [data, setData] = useState<Paginated<Row> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filterVals, setFilterVals] = useState<Record<string, string>>({});
  const [auditAction, setAuditAction] = useState("");
  const [opts, setOpts] = useState<Record<string, Opt[]>>({});
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  useToastMessage(flash, "success");
  const [modal, setModal] = useState<ModalState>(null);
  const [values, setValues] = useState<Values>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const handledEditQuery = useRef(false);
  const formFields = useMemo(() => {
    const visible = resource.fields.filter((f) => !f.roles || role === "super_admin" || (!!role && f.roles.includes(role)) || (resource.key === "schools" && role === "school_admin" && !user?.school));
    return role === "super_admin" && !["schools", "audit-logs"].includes(resource.key) && !resource.platform
      ? [{ name: "school", label: "School", type: "select" as const, required: true, createOnly: true, from: "/schools/" }, ...visible]
      : visible;
  }, [role, resource, user?.school]);

  // FK dropdowns / column labels ke liye options load karo
  useEffect(() => {
    const eps = new Set<string>();
    formFields.forEach((f) => f.from && eps.add(f.from));
    resource.columns.forEach((c) => c.fk && eps.add(c.fk));
    filterDefs.forEach((f) => f.from && eps.add(f.from));
    eps.forEach((ep) => {
      api<Paginated<Row>>(`${ep}?page_size=200`)
        .then((d) =>
          setOpts((o) => ({ ...o, [ep]: d.results.map((r) => ({ value: r.id, label: r.label ?? r.name ?? r.id, school: r.school ? String(r.school) : undefined })) }))
        )
        .catch(() => {});
    });
  }, [formFields, resource, filterDefs]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page) });
    if (query) qs.set("search", query);
    Object.entries(filterVals).forEach(([param, value]) => { if (value) qs.set(param, value); });
    if (resource.key === "audit-logs" && auditAction) qs.set("action", auditAction);
    try {
      setError("");
      setData(await api<Paginated<Row>>(`${resource.endpoint}?${qs}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to load records.");
    }
  }, [page, query, filterVals, auditAction, resource]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (handledEditQuery.current || !["students", "teachers"].includes(resource.key)) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("edit");
    if (!id) return;
    handledEditQuery.current = true;
    api<Row>(`${resource.endpoint}${id}/`).then((row) => {
      setFormError("");
      setValues(initialValues(formFields, row));
      setModal({ kind: "form", row });
      params.delete("edit");
      const suffix = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${suffix ? `?${suffix}` : ""}`);
    }).catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load the profile."));
  }, [resource.key, resource.endpoint, formFields]);

  const optsFor = (f: Field): Opt[] => {
    const all: Opt[] = f.options ?? (f.from ? opts[f.from] ?? [] : []);
    if (role !== "super_admin" || !f.from || f.from === "/schools/") return all;
    if (!values.school) return [];
    return all.filter((option) => !option.school || option.school === values.school);
  };
  const labelOf = (ep: string, id: string | null) =>
    id ? opts[ep]?.find((o) => o.value === id)?.label ?? "…" : "—";

  const activeFields = useMemo(() => {
    if (modal?.kind === "action") return modal.action.fields ?? [];
    if (modal?.kind === "form") {
      const fields = formFields.filter((f) => !(modal.row && f.createOnly) && !(!modal.row && f.editOnly));
      return modal.row ? fields.map((f) => f.optionalOnEdit ? { ...f, required: false } : f) : fields;
    }
    return [];
  }, [modal, formFields]);

  const openForm = (row: Row | null) => {
    setFormError("");
    setFieldErrs({});
    setValues(initialValues(formFields, row));
    setModal({ kind: "form", row });
  };

  const runAction = async (row: Row, action: RowAction) => {
    setFlash("");
    if (action.fields) {
      setFormError("");
      setValues(initialValues(action.fields, null));
      setModal({ kind: "action", row, action });
      return;
    }
    if (action.confirm && !window.confirm(action.confirm)) return;
    try {
      setFlash(await action.run(row, {}));
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The action failed. Please try again.");
    }
  };

  const runToolbarAction = async (action: ToolbarAction) => {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setFlash("");
    setError("");
    setToolbarBusy(action.label);
    try {
      setFlash(await action.run());
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The action failed. Please try again.");
    } finally {
      setToolbarBusy("");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    setSaving(true);
    setFormError("");
    setFieldErrs({});
    try {
      if (modal.kind === "action") {
        setFlash(await modal.action.run(modal.row, buildPayload(modal.action.fields ?? [], values, false)));
      } else {
        const editing = !!modal.row;
        const payload = buildPayload(formFields, values, editing);
        await api(editing ? `${resource.endpoint}${modal.row!.id}/` : resource.endpoint, {
          method: editing ? "PATCH" : "POST",
          body: payload,
          silent: true,
        });
        if (resource.key === "schools" && role === "school_admin" && !user?.school) {
          await refreshUser();
        }
        setFlash(`${resource.title}: ${editing ? "changes saved" : "new record added"}.`);
      }
      setModal(null);
      load();
    } catch (err) {
      const fields = modal.kind === "action" ? modal.action.fields ?? [] : formFields;
      const labels = Object.fromEntries(fields.map((f) => [f.name, f.label.replace(/s*(.*)$/, "")]));
      const errs = fieldErrors(err);
      setFieldErrs(errs);
      const message = readableError(err, labels, "Unable to save changes. Please try again.");
      setFormError(message);
      if (modal.kind !== "action") toast.error(Object.keys(errs).length ? "Please correct the fields marked in red." : message);
      const first = Object.keys(errs)[0];
      if (first) window.setTimeout(() => document.getElementById(`field-${first}`)?.focus(), 0);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row) => {
    if (!window.confirm("Delete this record? This action cannot be undone.")) return;
    try {
      await api(`${resource.endpoint}${row.id}/`, { method: "DELETE" });
      setFlash("Record deleted.");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to delete the record.");
    }
  };

  const rowActions = (resource.actions ?? []).filter((a) => role && (role === "super_admin" || a.roles.includes(role)));
  const hasActionsCol = (canWrite && resource.fields.length > 0) || (canDelete && !!resource.canDelete) || rowActions.length > 0;
  const columns = role === "super_admin" && !["schools", "audit-logs"].includes(resource.key) && !resource.platform
    ? [...resource.columns, { key: "school", label: "School", fk: "/schools/" }]
    : resource.columns;
  const pages = data ? Math.max(1, Math.ceil(data.count / 25)) : 1;
  const descriptions: Record<string, string> = {
    schools: role === "school_admin" && !user?.school
      ? "Create your school's official profile to activate school-scoped access for its existing accounts."
      : "View your school's profile and account details.",
    "academic-years": "Set the school year that classrooms and exams are organized around.",
    courses: "Build the courses offered by your school and keep their subject structure organized.",
    subjects: "Organize course subjects so schedules, assignments and results stay connected.",
    classrooms: "Create class sections for each academic year and assign class teachers.",
    "teaching-assignments": "Connect teachers to the classes and subjects they teach.",
    teachers: "Manage teacher profiles and school staff access.",
    students: "Manage student profiles, class placements and parent (father & mother) details.",
    exams: "Plan examination windows and manage the result publishing workflow.",
    schedules: "Set subject dates, timings, venues and marks for each examination.",
    results: "Enter and review marks. Published results are locked until an admin unlocks them.",
    "audit-logs": "Review important account and record changes made in this portal.",
  };

  return (
    <div className={isAdmin ? "space-y-5" : ""}>
      <div className={`mb-6 flex flex-wrap items-end gap-3 ${isAdmin ? "portal-admin-heading" : ""}`}>
        <div className="mr-auto"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Workspace</div><div className="mt-1 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight text-slate-900">{resource.title}</h1>{data && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">{data.count} records</span>}</div><p className="mt-1.5 max-w-2xl text-sm text-slate-500">{descriptions[resource.key] ?? `View and manage ${resource.title.toLowerCase()} for your portal.`}</p></div>
        {filterDefs.map((filter) => (
          <select
            key={filter.param}
            aria-label={`Filter by ${filter.label}`}
            className="input resource-filter !w-auto"
            value={filterVals[filter.param] ?? ""}
            onChange={(e) => {
              setPage(1);
              setFilterVals((current) => ({ ...current, [filter.param]: e.target.value }));
            }}
          >
            <option value="">{filter.label}: All</option>
            {(filter.options ?? (filter.from ? opts[filter.from] ?? [] : [])).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
        {resource.key === "audit-logs" && (
          <select aria-label="Filter audit actions" className="input !w-auto" value={auditAction} onChange={(e) => { setPage(1); setAuditAction(e.target.value); }}>
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        )}
        {resource.search && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setQuery(search);
            }}
            className="resource-search flex gap-2"
          >
            <input className="input min-w-0 sm:!w-48" type="search" aria-label={`Search ${resource.title}`} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn-ghost">Search</button>
          </form>
        )}
        {toolbarActions.map((action) => (
          <button key={action.label} className="btn-ghost" disabled={!!toolbarBusy} onClick={() => runToolbarAction(action)}>
            {toolbarBusy === action.label ? <><Spinner className="mr-2" />Working…</> : action.label}
          </button>
        ))}
        {canCreate && resource.fields.length > 0 && (
          <button className="btn-primary" onClick={() => openForm(null)}>
            + Add
          </button>
        )}
      </div>

      {flash && <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{flash}</div>}
      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {!canWrite && !error && <p className="mb-3 text-xs text-slate-500">This page is read-only for your role.</p>}

      <p className="mb-1.5 px-1 text-[11px] text-slate-500 sm:hidden">Swipe the table horizontally to see all columns.</p>
      <div className={`overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm ${isAdmin ? "portal-admin-card" : ""}`}>
        <table className={`w-full text-left text-sm ${resource.key === "audit-logs" ? "table-fixed" : ""}`}>
          <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`whitespace-nowrap px-4 py-3.5 font-semibold ${resource.key === "audit-logs" ? AUDIT_COLUMN_WIDTHS[c.key] ?? "" : ""}`}>
                  {c.label}
                </th>
              ))}
              {hasActionsCol && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!data && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={columns.length + (hasActionsCol ? 1 : 0)}>
                  Loading…
                </td>
              </tr>
            )}
            {data?.results.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={columns.length + (hasActionsCol ? 1 : 0)}>
                  No records found.
                </td>
              </tr>
            )}
            {data?.results.map((row) => (
              <tr key={row.id} className="transition hover:bg-indigo-50/30">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 ${resource.key === "audit-logs" ? `whitespace-normal ${c.key === "user_email" ? "break-all" : "break-words"} ${c.key === "changes" ? "text-xs text-slate-600" : ""}` : "whitespace-nowrap"}`}>
                    {c.render ? c.render(row) : c.fk ? labelOf(c.fk, row[c.key]) : String(row[c.key] ?? "")}
                  </td>
                ))}
                {hasActionsCol && (
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                    {rowActions
                      .filter((a) => !a.show || a.show(row, user))
                      .map((a) => (
                        <button key={a.label} className="resource-action-btn resource-action-btn--primary" onClick={() => runAction(row, a)}>
                          {a.label}
                        </button>
                      ))}
                    {canWrite && resource.fields.length > 0 && (!resource.rowEditable || (user && resource.rowEditable(row, user))) && (
                      <button className="resource-action-btn" onClick={() => openForm(row)}>
                        Edit
                      </button>
                    )}
                    {canDelete && resource.canDelete && (!resource.rowEditable || (user && resource.rowEditable(row, user))) && (
                      <button className="resource-action-btn resource-action-btn--danger" onClick={() => remove(row)}>
                        Delete
                      </button>
                    )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.count > 25 && (
        <div className="mt-3 flex items-center justify-end gap-3 text-sm">
          <button className="btn-ghost" disabled={!data.previous} onClick={() => setPage((p) => p - 1)}>
            Prev
          </button>
          <span>
            Page {page} / {pages} ({data.count})
          </span>
          <button className="btn-ghost" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}

      {modal && (
        <Modal
          title={modal.kind === "action" ? modal.action.label : modal.row ? `Edit ${resource.title}` : `Add ${resource.title}`}
          onClose={() => setModal(null)}
        >
          <form onSubmit={submit} className="space-y-3">
            {activeFields.some((f) => f.required) && <p className="mandatory-note rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-bold text-red-500">*</span> Fields marked with a red star are mandatory.</p>}
            {activeFields.map((f) => (
              <FieldInput
                key={f.name}
                f={f}
                value={values[f.name]}
                options={optsFor(f)}
                error={fieldErrs[f.name]}
                landline={resource.key === "schools"}
                onChange={(v) => { if (fieldErrs[f.name]) setFieldErrs((e) => ({ ...e, [f.name]: "" })); setValues((s) => {
                  const next = { ...s, [f.name]: v };
                  if (f.name === "school") formFields.forEach((field) => { if (field.from && field.name !== "school") next[field.name] = ""; });
                  return next;
                }); }}
              />
            ))}
            {formError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="btn-primary" disabled={saving}>
                {saving ? <><Spinner className="mr-2" />Saving…</> : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
