"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";
import { useAuth } from "@/lib/auth";

type Overview = {
  school_count: number;
  students: { total: number; active: number; inactive: number; boys: number; girls: number; other: number; unspecified: number };
  teachers: { total: number; active: number; inactive: number };
  pending_registrations: { students: number; teachers: number; total: number };
  academics: { academic_years: number; courses: number; classrooms: number; exams: number; admit_cards: number; published_results: number };
};

const stat = (label: string, value: number, tone = "text-slate-900") => <div key={label} className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="text-[11px] text-slate-500">{label}</p><p className={`mt-1 text-lg font-semibold ${tone}`}>{value.toLocaleString()}</p></div>;

export default function AdminOverviewPanel({ platformAdmin = false }: { platformAdmin?: boolean }) {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState("");

  const refreshOverview = useCallback(() => {
    if (user?.role !== "super_admin" && !user?.school) return;
    api<Overview>("/admin-overview/")
      .then((data) => {
        setOverview(data);
        setLoadError("");
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Unable to load school overview.");
      });
  }, [user?.role, user?.school]);

  useEffect(() => {
    if (user?.role !== "super_admin" && !user?.school) return;
    refreshOverview();
    const timer = window.setInterval(refreshOverview, 30_000);
    return () => window.clearInterval(timer);
  }, [refreshOverview, user?.role, user?.school]);

  if (!overview) return <section className="portal-admin-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Administrator school overview">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-slate-900">People and school activity</h2><p className="mt-1 text-sm text-slate-500">{loadError || "Loading overview..."}</p></div>
      <button type="button" onClick={refreshOverview} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Retry</button>
    </div>
  </section>;

  return <section className="space-y-4" aria-label="Administrator school overview">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">{platformAdmin ? "Platform overview" : "Administrator overview"}</p><h2 className="mt-1 text-xl font-semibold text-slate-900">People and school activity</h2></div>
      <Link href="/manage/accounts" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100">Review registrations <Icon name="arrow" size={14} /></Link>
    </div>
    <div className="grid gap-4 xl:grid-cols-3">
      {platformAdmin && <article className="portal-admin-card rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><div><p className="text-xs font-medium text-slate-500">Active schools</p><p className="mt-1 text-3xl font-semibold text-slate-900">{overview.school_count.toLocaleString()}</p></div><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon name="school" /></span></div>
        <Link href="/manage/schools" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">View schools <Icon name="arrow" size={13} /></Link>
      </article>}
      <article className="portal-admin-card rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><div><p className="text-xs font-medium text-slate-500">Registered students</p><p className="mt-1 text-3xl font-semibold text-slate-900">{overview.students.total.toLocaleString()}</p></div><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon name="student" /></span></div>
        <div className="mt-5 grid grid-cols-2 gap-2">{stat("Boys", overview.students.boys)}{stat("Girls", overview.students.girls)}{stat("Active", overview.students.active, "text-emerald-700")}{stat("Inactive", overview.students.inactive, "text-amber-700")}</div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">Inactive students need classroom placement and profile activation before they can sign in.</p>
        <p className="mt-3 text-[11px] text-slate-400">Other: {overview.students.other} · Not specified: {overview.students.unspecified}</p>
        <Link href="/manage/students" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">View all students <Icon name="arrow" size={13} /></Link>
      </article>
      <article className="portal-admin-card rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><div><p className="text-xs font-medium text-slate-500">Registered teachers</p><p className="mt-1 text-3xl font-semibold text-slate-900">{overview.teachers.total.toLocaleString()}</p></div><span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sky-700"><Icon name="teacher" /></span></div>
        <div className="mt-5 grid grid-cols-2 gap-2">{stat("Active", overview.teachers.active, "text-emerald-700")}{stat("Inactive", overview.teachers.inactive, "text-amber-700")}</div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">Inactive teachers need teaching assignments and profile activation before they can sign in.</p>
        <div className="mt-3 rounded-xl bg-indigo-50 px-3 py-2.5 text-xs text-indigo-800">Teacher applications pending <strong className="float-right">{overview.pending_registrations.teachers}</strong></div>
        <Link href="/manage/teachers" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">View all teachers <Icon name="arrow" size={13} /></Link>
      </article>
      <article className="portal-admin-card rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium text-slate-500">School activity</p><div className="mt-4 grid grid-cols-2 gap-2">{stat("Academic years", overview.academics.academic_years)}{stat("Courses", overview.academics.courses)}{stat("Classrooms", overview.academics.classrooms)}{stat("Exams", overview.academics.exams)}{stat("Admit cards", overview.academics.admit_cards)}{stat("Published results", overview.academics.published_results)}</div>
        <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800"><span>Applications waiting: {overview.pending_registrations.total}</span><span className="mt-1 block text-[10px]">Students {overview.pending_registrations.students} · Teachers {overview.pending_registrations.teachers}</span></div>
      </article>
    </div>
  </section>;
}
