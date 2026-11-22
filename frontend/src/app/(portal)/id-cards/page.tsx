"use client";
import { QRCodeSVG } from "qrcode.react";
import { useToastMessage } from "@/lib/toast";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CLASS_LEVELS } from "@/lib/resources";
import type { Paginated, Row } from "@/lib/types";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function Line({ label, value }: { label: string; value: unknown }) {
  const text = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div className="idcard-line">
      <span>{label}</span>
      <b>{text}</b>
    </div>
  );
}

function IDCardView({ card, origin }: { card: Row; origin: string }) {
  const student = card.holder_type === "student";
  const d = card.details ?? {};
  const initials = String(card.holder_name || "?").split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={`idcard-pair ${student ? "idcard--student" : "idcard--staff"}`}>
      <article className="idcard idcard-front" aria-label={`ID card front for ${card.holder_name}`}>
        <header className="idcard-header">
          <span className="idcard-logo">{String(card.school_name || "S").trim().slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0">
            <span className="idcard-school">{card.school_name}</span>
            <span className="idcard-school-sub">{card.school_address || (card.school_code ? `Code · ${card.school_code}` : "")}</span>
          </span>
        </header>
        <div className="idcard-band">{student ? "Student Identity Card" : "Staff Identity Card"}</div>
        <div className="idcard-photo">
          {card.holder_photo ? <img src={card.holder_photo} alt={`${card.holder_name} photo`} /> : <span>{initials}</span>}
        </div>
        <h3 className="idcard-name">{card.holder_name}</h3>
        <p className="idcard-role">
          {student ? (d.class_level ? `Class ${d.class_level}${d.section ? ` · Section ${d.section}` : ""}` : "Student") : d.designation || "Teacher"}
        </p>
        <div className="idcard-lines">
          <Line label={student ? "Adm. No." : "Emp. ID"} value={card.reference_no} />
          {student ? (
            <>
              <Line label="Roll No." value={d.roll_no} />
              <Line label="D.O.B." value={formatDate(d.date_of_birth)} />
              <Line label="Blood Gr." value={d.blood_group} />
            </>
          ) : (
            <>
              <Line label="Phone" value={d.phone} />
              <Line label="Joined" value={formatDate(d.joining_date)} />
            </>
          )}
        </div>
        <footer className="idcard-foot">
          <span>Valid till {formatDate(card.valid_until)}</span>
          <span className="idcard-sign">Principal</span>
        </footer>
      </article>
      <article className="idcard idcard-back" aria-label={`ID card back for ${card.holder_name}`}>
        <div className="idcard-back-title">{student ? "Parents & emergency" : "Contact details"}</div>
        <div className="idcard-lines">
          {student ? (
            <>
              <Line label="Father" value={d.father_name} />
              <Line label="Mother" value={d.mother_name} />
              <Line label="Phone" value={d.guardian_phone} />
              <Line label="Address" value={d.address} />
            </>
          ) : (
            <>
              <Line label="Email" value={d.email} />
              <Line label="Qualif." value={d.qualification} />
            </>
          )}
        </div>
        <div className="idcard-qr">
          {origin ? <QRCodeSVG value={`${origin}/verify-id/${encodeURIComponent(String(card.code))}`} size={92} level="M" marginSize={2} title="Scan to verify this ID card" /> : null}
          <span>Scan to verify</span>
        </div>
        <p className="idcard-code">ID {card.code}</p>
        <p className="idcard-note">
          This card is the property of {card.school_name}. If found, please return it to the school office
          {card.school_phone ? ` or call ${card.school_phone}` : ""}.
        </p>
        <p className="idcard-issued">Issued {formatDate(card.issued_on)}</p>
      </article>
    </div>
  );
}

export default function IDCardsPage() {
  const { user } = useAuth();
  const role = user?.role;
  const isAdmin = role === "school_admin" || role === "super_admin";
  const isStudent = role === "student";
  const [cards, setCards] = useState<Row[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [holder, setHolder] = useState(isStudent ? "" : "student");
  const [classLevel, setClassLevel] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  useToastMessage(flash, "success");
  const [busy, setBusy] = useState("");
  const [origin, setOrigin] = useState("");
  const [printOnly, setPrintOnly] = useState<string | null>(null);

  useEffect(() => {
    setOrigin((process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, ""));
    const after = () => setPrintOnly(null);
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, []);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), page_size: "24" });
    if (holder) qs.set("holder_type", holder);
    if (classLevel && holder !== "teacher") qs.set("student__class_level", classLevel);
    if (query) qs.set("search", query);
    try {
      setError("");
      const data = await api<Paginated<Row>>(`/id-cards/?${qs}`);
      setCards(data.results);
      setCount(data.count);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to load ID cards.");
      setCards([]);
    }
  }, [page, holder, classLevel, query]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (label: string, run: () => Promise<string>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(label);
    setFlash("");
    setError("");
    try {
      setFlash(await run());
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The action failed. Please try again.");
    } finally {
      setBusy("");
    }
  };

  const printCards = (id: string | null) => {
    setPrintOnly(id);
    window.setTimeout(() => window.print(), 50);
  };

  const pages = Math.max(1, Math.ceil(count / 24));
  const visible = cards ?? [];

  return (
    <div className="idcards-page space-y-5">
      <div className="no-print flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Identity</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{isStudent ? "My ID Card" : "ID Cards"}</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">
            {isStudent
              ? "Your school identity card. Print it or save it as a PDF."
              : "An identity card is issued automatically when a student is admitted or a teacher joins. Every card has a QR code for verification."}
          </p>
        </div>
        {!isStudent && (
          <>
            <select aria-label="Card holder" className="input !w-auto" value={holder} onChange={(e) => { setPage(1); setHolder(e.target.value); }}>
              <option value="student">Students</option>
              {role !== "exam_controller" && <option value="teacher">Teachers</option>}
              <option value="">Everyone</option>
            </select>
            {holder !== "teacher" && (
              <select aria-label="Class" className="input !w-auto" value={classLevel} onChange={(e) => { setPage(1); setClassLevel(e.target.value); }}>
                <option value="">Class: All</option>
                {CLASS_LEVELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            )}
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search); }}>
              <input className="input min-w-0 sm:!w-48" type="search" aria-label="Search ID cards" placeholder="Name, admission no…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button className="btn-ghost">Search</button>
            </form>
          </>
        )}
        {isAdmin && (
          <button
            className="btn-ghost"
            disabled={!!busy}
            onClick={() => act("missing", async () => (await api<{ detail: string }>("/id-cards/issue-missing/", { method: "POST", body: {} })).detail)}
          >
            {busy === "missing" ? <><Spinner className="mr-2" />Issuing…</> : "Issue missing cards"}
          </button>
        )}
        <button className="btn-primary" disabled={!visible.length || !origin} onClick={() => printCards(null)}>
          <Icon name="printer" size={16} className="mr-2" />
          {isStudent ? "Print / Save PDF" : `Print ${visible.length} card${visible.length === 1 ? "" : "s"}`}
        </button>
      </div>

      {flash && <div className="no-print rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{flash}</div>}
      {error && <div className="no-print rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {cards === null && <p className="no-print text-sm text-slate-500"><Spinner className="mr-2" />Loading ID cards…</p>}
      {cards?.length === 0 && !error && (
        <p className="no-print rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
          {isStudent ? "Your ID card has not been issued yet. Please contact the school office." : "No ID cards match these filters."}
        </p>
      )}

      <div className={`idcard-grid ${printOnly ? "idcard-grid--single" : ""}`}>
        {visible.map((card) => (
          <section key={card.id} className={`idcard-item ${printOnly && printOnly !== card.id ? "idcard-item--skip" : ""}`}>
            <IDCardView card={card} origin={origin} />
            <div className="no-print mt-3 flex flex-wrap items-center gap-2">
              {card.is_revoked ? (
                <span className="status-pill status-pill--red">Revoked</span>
              ) : card.is_valid ? (
                <span className="status-pill status-pill--green">Valid</span>
              ) : (
                <span className="status-pill status-pill--amber">Inactive / expired</span>
              )}
              <button className="resource-action-btn" onClick={() => printCards(card.id)}>Print</button>
              {isAdmin && (
                <>
                  <button
                    className="resource-action-btn resource-action-btn--primary"
                    disabled={!!busy}
                    onClick={() => act(card.id, async () => { await api(`/id-cards/${card.id}/reissue/`, { method: "POST" }); return "ID card reissued with a new verification code."; }, "Reissue this card? The old card's QR code will stop working.")}
                  >
                    Reissue
                  </button>
                  {!card.is_revoked && (
                    <button
                      className="resource-action-btn resource-action-btn--danger"
                      disabled={!!busy}
                      onClick={() => act(card.id, async () => { await api(`/id-cards/${card.id}/revoke/`, { method: "POST" }); return "ID card revoked."; }, "Revoke this ID card? Verification will show it as invalid.")}
                    >
                      Revoke
                    </button>
                  )}
                </>
              )}
            </div>
          </section>
        ))}
      </div>

      {count > 24 && (
        <div className="no-print flex items-center justify-end gap-3 text-sm">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>Page {page} / {pages}</span>
          <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
