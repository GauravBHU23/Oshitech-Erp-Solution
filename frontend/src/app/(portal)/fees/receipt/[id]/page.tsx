"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { rupees } from "@/lib/resources";
import type { Paginated, Row } from "@/lib/types";
import Icon from "@/components/Icon";

function inWords(value: number) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`);
  const three = (n: number) => (n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? " " + two(n % 100) : ""}` : two(n));
  let n = Math.floor(value);
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return parts.join(" ");
}

export default function ReceiptPage({ params }: { params: { id: string } }) {
  const [payment, setPayment] = useState<Row | null>(null);
  const [invoice, setInvoice] = useState<Row | null>(null);
  const [school, setSchool] = useState<Row | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Row>(`/fee-payments/${params.id}/`)
      .then((p) => {
        setPayment(p);
        return api<Row>(`/fee-invoices/${p.invoice}/`).then(setInvoice);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Receipt not found."));
    api<Paginated<Row>>("/schools/?page_size=1").then((d) => setSchool(d.results[0] ?? null)).catch(() => {});
  }, [params.id]);

  if (error) return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;
  if (!payment) return <p className="text-sm text-slate-500">Loading receipt…</p>;
  const amount = Number(payment.amount);

  return (
    <div className="admit-card-page space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/fees" className="btn-ghost"><Icon name="arrow" size={15} className="mr-2 rotate-180" />Back to fees</Link>
        <button className="btn-primary" onClick={() => window.print()}><Icon name="printer" size={16} className="mr-2" />Print / Save PDF</button>
      </div>
      <article className="admit-paper print-card mx-auto w-full max-w-[190mm] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 print:!min-h-0">
        <header className="admit-card-header border-b-4 border-emerald-500 bg-slate-900 px-6 py-5 text-white">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-600 text-lg font-extrabold">{String(school?.name || "S").slice(0, 1)}</div>
            <div className="min-w-0 flex-1">
              <h1 className="admit-card-school-name text-base font-extrabold uppercase sm:text-lg">{school?.name}</h1>
              <p className="admit-card-school-details mt-1 text-[10px] text-white/75">{[school?.address, school?.city, school?.state, school?.pincode].filter(Boolean).join(", ")}{school?.phone ? ` · ${school.phone}` : ""}</p>
            </div>
            <div className="admit-card-type shrink-0 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-center text-[9px] font-extrabold uppercase leading-4 tracking-[0.1em]">Fee<br />Receipt</div>
          </div>
        </header>
        <div className="space-y-5 px-6 py-6 text-sm sm:px-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[["Receipt no.", payment.receipt_no], ["Date", payment.paid_on], ["Invoice no.", payment.invoice_no], ["Mode", String(payment.mode).toUpperCase()]].map(([k, v]) => (
              <div key={k} className="border-b border-slate-200 pb-2"><div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{k}</div><div className="mt-1 font-semibold text-slate-900">{v}</div></div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Received from</div><div className="mt-1 font-semibold text-slate-900">{payment.student_name}</div><div className="text-xs text-slate-600">Admission no. {payment.admission_no}{invoice?.class_level ? ` · Class ${invoice.class_level}` : ""}</div></div>
            <div><div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Reference</div><div className="mt-1 font-semibold text-slate-900">{payment.reference || "—"}</div></div>
          </div>
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-[9px] uppercase tracking-wide text-slate-700"><tr><th className="border border-slate-300 px-3 py-2">Particulars</th><th className="border border-slate-300 px-3 py-2 text-right">Amount</th></tr></thead>
            <tbody>
              <tr><td className="border border-slate-300 px-3 py-2">{payment.invoice_title}</td><td className="border border-slate-300 px-3 py-2 text-right">{rupees(invoice?.amount)}</td></tr>
              {Number(invoice?.discount) > 0 && <tr><td className="border border-slate-300 px-3 py-2">Less: discount / scholarship</td><td className="border border-slate-300 px-3 py-2 text-right">− {rupees(invoice?.discount)}</td></tr>}
              {Number(invoice?.fine) > 0 && <tr><td className="border border-slate-300 px-3 py-2">Add: late fine</td><td className="border border-slate-300 px-3 py-2 text-right">{rupees(invoice?.fine)}</td></tr>}
              <tr className="font-bold"><td className="border border-slate-300 px-3 py-2">Amount received now</td><td className="border border-slate-300 px-3 py-2 text-right">{rupees(amount)}</td></tr>
              <tr><td className="border border-slate-300 px-3 py-2">Balance remaining on this invoice</td><td className="border border-slate-300 px-3 py-2 text-right">{rupees(invoice?.balance)}</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-slate-700"><b>In words:</b> Rupees {inWords(amount)}{amount % 1 ? ` and ${Math.round((amount % 1) * 100)} Paise` : ""} only.</p>
          <div className="flex items-end justify-between gap-4 pt-8 text-[10px] text-slate-600">
            <span>Received by: {payment.received_by_name || "School office"}</span>
            <span className="min-w-[40mm] border-t border-slate-400 pt-1 text-center font-semibold">Authorised signatory</span>
          </div>
          <p className="border-t border-dashed border-slate-300 pt-3 text-center text-[9px] text-slate-500">This is a computer-generated receipt from Oshitech Education ERP.</p>
        </div>
      </article>
    </div>
  );
}
