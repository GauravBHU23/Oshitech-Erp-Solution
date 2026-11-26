"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";

export default function VisitorCount() {
  const [count, setCount] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadCount = useCallback(async () => {
    setLoading(true);
    setUnavailable(false);
    let visitorKey = window.localStorage.getItem("oshitech-visitor-key");
    if (!visitorKey) {
      visitorKey = window.crypto.randomUUID();
      window.localStorage.setItem("oshitech-visitor-key", visitorKey);
    }
    try {
      const result = await api<{ total_visitors: number }>("/site-visitors/", {
        method: "POST",
        body: { visitor_key: visitorKey },
      });
      setCount(result.total_visitors);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCount(); }, [loadCount]);

  return <div className="visitor-count-card inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
    <span className="visitor-count-card__icon grid h-9 w-9 place-items-center rounded-lg bg-indigo-100 text-indigo-700"><Icon name="users" size={17} /></span>
    <span><span className="block text-[10px] text-slate-600">Unique website visitors</span><span className="mt-0.5 block text-sm font-semibold text-slate-900">{count === null ? (unavailable ? "Unavailable" : <span className="inline-flex items-center gap-2"><Spinner className="h-3.5 w-3.5" />Loading</span>) : count.toLocaleString()}</span>{unavailable && <button type="button" onClick={() => void loadCount()} disabled={loading} className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-medium text-indigo-700 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-900 disabled:opacity-50">{loading && <Spinner className="h-3 w-3" />}Try again</button>}</span>
  </div>;
}
