"use client";

import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Paginated } from "@/lib/types";
import Icon from "@/components/Icon";

type Subject = { course: string; subject: string };
type StudentTeacher = {
  id: string;
  name: string;
  photo_url: string | null;
  subjects: Subject[];
  rating: number | null;
  feedback: string;
};
type AdminRating = {
  id: string;
  teacher_name: string;
  student_name: string;
  school_name: string;
  rating: number;
  feedback: string;
  updated_at: string;
};
type Draft = { rating: number; feedback: string };

function Stars({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange?: (rating: number) => void;
  label: string;
}) {
  return onChange ? (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, index) => {
        const rating = index + 1;
        return (
          <button
            key={rating}
            type="button"
            role="radio"
            aria-checked={value === rating}
            aria-label={`${rating} star${rating === 1 ? "" : "s"}`}
            onClick={() => onChange(rating)}
            className="rounded p-1 text-amber-400 transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            <Icon name="star" size={23} className={rating <= value ? "fill-current" : "text-slate-300"} />
          </button>
        );
      })}
    </div>
  ) : (
    <span className="flex items-center gap-0.5 text-amber-400" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Icon key={index} name="star" size={16} className={index < value ? "fill-current" : "text-slate-200"} />
      ))}
    </span>
  );
}

function StudentRatingForm() {
  const [teachers, setTeachers] = useState<StudentTeacher[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [messages, setMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    api<StudentTeacher[]>("/teachers/my-ratings/")
      .then((results) => {
        setTeachers(results);
        setDrafts(Object.fromEntries(results.map((teacher) => [
          teacher.id,
          { rating: teacher.rating ?? 0, feedback: teacher.feedback },
        ])));
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Could not load your teachers."))
      .finally(() => setLoading(false));
  }, []);

  const save = async (teacher: StudentTeacher) => {
    const draft = drafts[teacher.id];
    if (!draft?.rating) {
      setMessages((current) => ({ ...current, [teacher.id]: "Choose a star rating first." }));
      return;
    }
    setSavingId(teacher.id);
    setMessages((current) => ({ ...current, [teacher.id]: "" }));
    try {
      await api("/teachers/my-ratings/", {
        method: "POST",
        body: { teacher_id: teacher.id, rating: draft.rating, feedback: draft.feedback },
      });
      setTeachers((current) => current.map((item) => item.id === teacher.id
        ? { ...item, rating: draft.rating, feedback: draft.feedback }
        : item));
      setMessages((current) => ({ ...current, [teacher.id]: "Your rating has been saved." }));
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [teacher.id]: error instanceof ApiError ? error.message : "Could not save your rating. Please try again.",
      }));
    } finally {
      setSavingId("");
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">Your class</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Rate your teachers</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Your written feedback is private to school administrators. Only average stars and rating counts appear on the public homepage.</p>
      </div>
      {loading && <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading your teachers…</p>}
      {loadError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</p>}
      {!loading && !loadError && teachers.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No teachers are assigned to your classroom yet.</p>}
      {teachers.map((teacher) => {
        const draft = drafts[teacher.id] ?? { rating: teacher.rating ?? 0, feedback: teacher.feedback };
        return (
          <article key={teacher.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-indigo-50 text-lg font-semibold text-indigo-700">
                  {teacher.photo_url ? <img src={teacher.photo_url} alt="" className="h-full w-full object-cover" /> : teacher.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-slate-900">{teacher.name}</h2>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {teacher.subjects.map((subject) => <span key={`${subject.course}-${subject.subject}`} className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-medium text-indigo-700">{subject.course} · {subject.subject}</span>)}
                  </div>
                </div>
              </div>
              <div className="min-w-[220px]">
                <p className="mb-1 text-xs font-medium text-slate-600">Your rating</p>
                <Stars value={draft.rating} label={`Rate ${teacher.name}`} onChange={(rating) => setDrafts((current) => ({ ...current, [teacher.id]: { ...draft, rating } }))} />
              </div>
            </div>
            <label className="mt-4 block text-xs font-medium text-slate-600">
              Written feedback <span className="font-normal text-slate-400">(admins only)</span>
              <textarea
                className="input mt-1.5 min-h-24"
                maxLength={2000}
                value={draft.feedback}
                onChange={(event) => setDrafts((current) => ({ ...current, [teacher.id]: { ...draft, feedback: event.target.value } }))}
                placeholder="Share what is helpful or could be improved."
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p role={messages[teacher.id] && messages[teacher.id] !== "Your rating has been saved." ? "alert" : "status"} className="text-xs text-slate-500">{messages[teacher.id]}</p>
              <button type="button" className="btn-primary" disabled={savingId === teacher.id} onClick={() => void save(teacher)}>
                {savingId === teacher.id ? "Saving…" : teacher.rating ? "Update rating" : "Submit rating"}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function AdminFeedbackInbox() {
  const [ratings, setRatings] = useState<AdminRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Paginated<AdminRating>>("/teachers/ratings/?page_size=100")
      .then((data) => setRatings(data.results))
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Could not load teacher feedback."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">Private school feedback</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Teacher feedback</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Written comments are visible only to administrators. Public teacher cards show aggregate stars and counts.</p>
      </div>
      {loading && <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading feedback…</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!loading && !error && ratings.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No student feedback has been submitted yet.</p>}
      {ratings.map((item) => (
        <article key={item.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-slate-900">{item.teacher_name}</h2><p className="mt-1 text-xs text-slate-500">{item.school_name} · Student: {item.student_name}</p></div>
            <div className="flex items-center gap-2"><Stars value={item.rating} label={`${item.rating} out of 5`} /><span className="text-sm font-semibold text-slate-700">{item.rating}/5</span></div>
          </div>
          <p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-sm leading-6 text-slate-700">{item.feedback || "No written comment."}</p>
          <time className="mt-3 block text-[11px] text-slate-400">{new Date(item.updated_at).toLocaleString()}</time>
        </article>
      ))}
    </section>
  );
}

export default function TeacherFeedbackPage() {
  const { user, loading } = useAuth();
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (user?.role === "student") return <StudentRatingForm />;
  if (user?.role === "school_admin" || user?.role === "super_admin") return <AdminFeedbackInbox />;
  return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">This page is available to students and administrators only.</p>;
}
