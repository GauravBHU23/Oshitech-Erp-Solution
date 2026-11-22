"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/stre";
import type { Row } from "@/lib/types";
import Icon from "@/components/Icon";
import StreEmailCard from "@/components/StreEmailCard";
import { useAuth } from "@/lib/auth";

export default function StreAdminDashboard({ name }: { name: string }) {
  const { user } = useAuth();
  const [d, setD] = useState<Row | null>(null);
  useEffect(() => {
    const load = () => api<Row>("/stre/admin/dashboard/").then(setD).catch(() => {});
    load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, []);
  const exam = d?.open_exam as Row | null | undefined;
  const cards: [string, string | number, string, string][] = [
    ["Total registrations", d?.registrations ?? "—", "users", "/stre-admin/registrations"],
    ["Registered today", d?.today ?? "—", "calendar", "/stre-admin/registrations"],
    ["Payments to verify", d?.to_verify ?? "—", "wallet", "/stre-admin/registrations"],
    ["Open support requests", d?.support_open ?? "—", "ticket", "/stre-admin/support"],
    ["Paid (admit card due)", d?.paid ?? "—", "check", "/stre-admin/registrations"],
    ["Admit cards issued", d?.admit_cards ?? "—", "ticket", "/stre-admin/registrations"],
    ["Fee collected", d ? `₹${Number(d.collected).toLocaleString("en-IN")}` : "—", "award", "/stre-admin/registrations"],
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="stre-hero relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-[#3b1d6e] to-[#18243b] px-6 py-8 text-white sm:px-9">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-200">Upcoming Exam Admin Portal</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">STRE — Student Talent Recognition Exam</h1>
        <p className="mt-2 text-sm text-slate-300">Welcome, {name}. Manage registrations, payments and admit cards. This portal is separate from school records.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/stre-admin/registrations" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-800"><Icon name="users" size={16} />Registrations</Link>
          <Link href="/manage/stre-exams" className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold">Exams & fees</Link>
          <a href="/stre" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold">Open public form<Icon name="external" size={14} /></a>
        </div>
      </section>
      {d && !exam && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <b className="block">Registration is closed — the public form will show “closed”.</b>
          {(d.closed_exams as Row[] | undefined)?.length ? (
            <>
              <ul className="mt-2 space-y-1">
                {(d.closed_exams as Row[]).map((e) => <li key={e.id}>• <b>{e.title} ({e.code})</b>: {e.reason}.</li>)}
              </ul>
              <p className="mt-2">Open <Link href="/manage/stre-exams" className="font-semibold underline">Exams & Fees</Link>, click <b>Edit</b>, set the last date to today or later and keep “Registration open” ticked.</p>
            </>
          ) : (
            <p className="mt-1">No exam has been created yet. <Link href="/manage/stre-exams" className="font-semibold underline">Create an exam</Link> with a last date of today or later and keep “Registration open” ticked.</p>
          )}
        </section>
      )}
      {exam && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><b>{exam.title} ({exam.code})</b> is open for registration — exam on {formatDate(exam.exam_date)}, last date {formatDate(exam.last_date)}, fee {Number(exam.fee) > 0 ? `₹${Number(exam.fee).toLocaleString("en-IN")}` : "free"}.</section>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value, icon, href]) => (
          <Link key={label} href={href} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon name={icon} /></span>
            <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
            <div className="mt-1 text-sm text-slate-500">{label}</div>
          </Link>
        ))}
      </section>
      <StreEmailCard defaultTo={user?.email ?? ""} />
    </div>
  );
}
