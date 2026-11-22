"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";

type Overview = { schools: number; students: number; teachers: number };

const metrics = [
  { key: "schools", label: "Active schools", icon: "school", tone: "bg-indigo-50 text-indigo-700" },
  { key: "students", label: "Active students", icon: "student", tone: "bg-emerald-50 text-emerald-700" },
  { key: "teachers", label: "Active teachers", icon: "teacher", tone: "bg-sky-50 text-sky-700" },
] as const;

export default function PublicOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState(false);

  const loadOverview = useCallback(() => {
    setError(false);
    api<Overview>("/public-overview/")
      .then(setOverview)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  return (
    <section id="community" aria-label="School community overview" className="bg-white px-4 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-indigo-600">Our community</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Schools, students and teachers at a glance.</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500 sm:text-sm">A live overview of active school communities on Oshitech.</p>
        </div>
        {error ? (
          <div role="alert" className="mx-auto mt-8 max-w-xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
            <p>Community overview is temporarily unavailable.</p>
            <button type="button" onClick={loadOverview} className="mt-2 font-semibold underline underline-offset-2">Try again</button>
          </div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {metrics.map((metric, index) => (
              <article
                key={metric.key}
                style={{ animationDelay: `${index * 100}ms` }}
                className="animate-rise-in rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-md motion-reduce:animate-none motion-reduce:transition-none"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-600 sm:text-sm">{metric.label}</p>
                  <span className={`grid h-9 w-9 place-items-center rounded-lg ${metric.tone}`}><Icon name={metric.icon} size={17} /></span>
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                  {overview ? overview[metric.key].toLocaleString() : <span className="inline-block h-8 w-12 animate-pulse rounded-md bg-slate-200" aria-label="Loading" />}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
