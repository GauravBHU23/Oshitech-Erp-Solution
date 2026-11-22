"use client";
import { useEffect, useState } from "react";
import { NGROK_SKIP_BROWSER_WARNING_HEADERS } from "@/lib/api";

// Result ON hai ya OFF (admin Results page se karta hai). Ek page par ek hi request.
let cached: Promise<boolean> | null = null;
let cachedAt = 0;

function fetchFlag(): Promise<boolean> {
  if (!cached || Date.now() - cachedAt > 60_000) {
    cachedAt = Date.now();
    cached = fetch("/api/v1/stre/public/", { headers: NGROK_SKIP_BROWSER_WARNING_HEADERS })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: { results_published?: boolean }) => !!d.results_published)
      .catch(() => false);
  }
  return cached;
}

/** null = abhi pata nahi; true = result website par dikhana hai. */
export function useStreResultsOn() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetchFlag().then((v) => alive && setOn(v));
    return () => { alive = false; };
  }, []);
  return on;
}
