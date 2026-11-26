"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

type TeacherCard = { id: string; name: string; school_name: string; photo_url: string | null; teaching: { course: string; subject: string }[]; rating_average: number | null; rating_count: number };
type DirectoryResponse = { count: number; next: string | null; results: TeacherCard[] };

export default function TeacherDirectory() {
  const [teachers, setTeachers] = useState<TeacherCard[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (page: number) => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await api<DirectoryResponse>(`/teachers/directory/?page=${page}&page_size=12`);
      setTeachers((current) => page === 1 ? result.results : [...current, ...result.results]);
      setNextPage(result.next ? page + 1 : null);
    } catch {
      setLoadError(true);
      if (page === 1) setNextPage(null);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void load(1); }, [load]);

  return <section id="teachers" className="scroll-mt-32 bg-[#f8f9fc] px-4 py-10 sm:px-8 sm:py-14">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-indigo-600">Meet the faculty</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Learn from our teachers.</h2></div><p className="max-w-md text-sm leading-6 text-slate-500">See teacher profiles and the courses and subjects they are assigned to teach.</p></div>
      {loadError && <div role="alert" className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900"><p>Teacher profiles could not be loaded.</p><button type="button" onClick={() => void load(1)} className="mt-2 font-semibold underline underline-offset-2">Try again</button></div>}
      {loading && teachers.length === 0 && <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div>}
      {!loadError && !loading && loaded && teachers.length === 0 && <div className="mt-9 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Icon name="teacher" /></span><p className="mt-3 text-sm font-medium text-slate-700">Teacher profiles will appear here</p><p className="mt-1 text-xs text-slate-500">Teachers must be active and allow their profiles to appear on the public homepage.</p></div>}
      {teachers.length > 0 && <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{teachers.map((teacher) => <article key={teacher.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center gap-3"><div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-indigo-50 text-lg font-semibold text-indigo-700">{teacher.photo_url ? <img className="h-full w-full object-cover" src={teacher.photo_url} alt={`${teacher.name} profile`} loading="lazy" decoding="async" /> : teacher.name.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900">{teacher.name}</h3><p className="mt-1 truncate text-xs text-slate-500">{teacher.school_name}</p>{teacher.rating_count > 0 ? <div className="mt-1.5 flex items-center gap-1.5" aria-label={`${teacher.rating_average?.toFixed(1)} out of 5 from ${teacher.rating_count} student ratings`}><span className="flex text-amber-400" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <Icon key={index} name="star" size={13} className={index < Math.round(teacher.rating_average ?? 0) ? "fill-current" : "text-slate-200"} />)}</span><span className="text-[10px] font-semibold text-slate-600">{teacher.rating_average?.toFixed(1)} ({teacher.rating_count})</span></div> : <p className="mt-1.5 text-[10px] text-slate-400">No student ratings yet</p>}</div></div><div className="mt-5 border-t border-slate-100 pt-4"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">Courses & subjects</p>{teacher.teaching.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">{teacher.teaching.map((item) => <span key={`${item.course}-${item.subject}`} className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-medium text-indigo-700">{item.course} · {item.subject}</span>)}</div> : <p className="mt-2 text-xs text-slate-500">Teaching subjects will appear after the school assigns them.</p>}</div></article>)}</div>}
      {nextPage && teachers.length > 0 && <div className="mt-8 text-center"><button type="button" disabled={loading} onClick={() => void load(nextPage)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 disabled:opacity-60">{loading ? <><Spinner />Loading teachers…</> : <>Show more teachers<Icon name="arrow" size={15} /></>}</button></div>}
    </div>
  </section>;
}
