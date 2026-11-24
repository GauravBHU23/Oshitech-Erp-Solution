"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { rupees, statusPill } from "@/lib/resources";
import type { Paginated, Row } from "@/lib/types";
import Icon from "@/components/Icon";

const STATUS: Record<string, [string, "green" | "amber" | "red" | "slate"]> = { paid: ["Paid", "green"], partial: ["Partly paid", "amber"], overdue: ["Overdue", "red"], unpaid: ["Unpaid", "slate"] };

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight text-slate-900 ${tone}`}>{value}</div>
    </div>
  );
}

export default function FeesPage() {
  const { user } = useAuth();
  const isStudent = user?.role === "student";
  const [summary, setSummary] = useState<Row | null>(null);
  const [collection, setCollection] = useState<Row | null>(null);
  const [invoices, setInvoices] = useState<Row[] | null>(null);
  const [payments, setPayments] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "Unable to load fees.");
    api<Row>("/fee-invoices/summary/").then(setSummary).catch(fail);
    api<Paginated<Row>>(`/fee-invoices/?page_size=${isStudent ? 200 : 10}${isStudent ? "" : "&status=overdue"}`).then((d) => setInvoices(d.results)).catch(fail);
    api<Paginated<Row>>(`/fee-payments/?page_size=${isStudent ? 200 : 10}`).then((d) => setPayments(d.results)).catch(fail);
    if (!isStudent) api<Row>("/fee-payments/collection/").then(setCollection).catch(() => {});
  }, [isStudent]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Fees</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{isStudent ? "My Fees" : "Fees Overview"}</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{isStudent ? "Your fee invoices, payments and receipts." : "Collection at a glance. Set up fees, generate invoices and record payments from the links below."}</p>
        </div>
        {!isStudent && (
          <div className="flex flex-wrap gap-2">
            <Link href="/manage/fee-structures" className="btn-ghost">Fee structure</Link>
            <Link href="/manage/fee-invoices" className="btn-ghost">Invoices</Link>
            <Link href="/manage/fee-payments" className="btn-primary">Payments & receipts</Link>
          </div>
        )}
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={isStudent ? "Total fees" : "Total billed"} value={rupees(summary?.total)} />
        <Stat label={isStudent ? "Paid" : "Collected"} value={rupees(summary?.collected)} tone="!text-emerald-600" />
        <Stat label="Balance due" value={rupees(summary?.due)} tone={Number(summary?.due) > 0 ? "!text-red-600" : ""} />
        {isStudent ? <Stat label="Overdue invoices" value={String(summary?.overdue ?? 0)} /> : <Stat label="Collected this month" value={rupees(collection?.this_month)} />}
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-900">{isStudent ? "My invoices" : "Overdue invoices"}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50/80 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr>{["Invoice", ...(isStudent ? [] : ["Student"]), "Fee", "Total", "Balance", "Due", "Status"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {invoices === null && <tr><td colSpan={7} className="px-4 py-6 text-slate-400">Loading…</td></tr>}
              {invoices?.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-slate-400">{isStudent ? "No fee invoices yet." : "No overdue invoices. 🎉"}</td></tr>}
              {invoices?.map((inv) => (
                <tr key={inv.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{inv.invoice_no}</td>
                  {!isStudent && <td className="px-4 py-3">{inv.student_name} <span className="text-xs text-slate-400">({inv.admission_no})</span></td>}
                  <td className="px-4 py-3">{inv.title}</td>
                  <td className="whitespace-nowrap px-4 py-3">{rupees(inv.total)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold">{rupees(inv.balance)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{inv.due_date}</td>
                  <td className="px-4 py-3">{statusPill(...(STATUS[inv.status] ?? [inv.status, "slate"]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-900">{isStudent ? "My payments & receipts" : "Latest payments"}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50/80 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr>{["Receipt", "Date", ...(isStudent ? [] : ["Student"]), "Fee", "Amount", "Mode", ""].map((h, i) => <th key={i} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {payments === null && <tr><td colSpan={7} className="px-4 py-6 text-slate-400">Loading…</td></tr>}
              {payments?.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-slate-400">No payments recorded yet.</td></tr>}
              {payments?.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{p.receipt_no}</td>
                  <td className="whitespace-nowrap px-4 py-3">{p.paid_on}</td>
                  {!isStudent && <td className="px-4 py-3">{p.student_name}</td>}
                  <td className="px-4 py-3">{p.invoice_title}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold">{rupees(p.amount)}</td>
                  <td className="px-4 py-3">{String(p.mode).toUpperCase()}</td>
                  <td className="px-4 py-3 text-right"><Link href={`/fees/receipt/${p.id}`} className="resource-action-btn resource-action-btn--primary"><Icon name="printer" size={13} className="mr-1" />Receipt</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
