"use client";
import { useEffect, useState } from "react";

export type PublicNotice = {
  id: string; title: string; body: string; category: string; event_date: string | null; end_date: string | null;
  publish_on: string; is_pinned: boolean; school: string; attachment_url?: string | null;
};
export type PublicStre = { title: string; code: string; exam_date: string; last_date: string; fee: string } | null;
export type PublicStreNotice = { id: string; title: string; body: string; is_pinned: boolean; publish_on: string; attachment_url?: string | null };
export type PublicNoticeData = { notices: PublicNotice[]; stre: PublicStre; stre_result?: string | null; stre_notices?: PublicStreNotice[] };

// Ticker aur notice board dono ek hi request share karte hain (har minute refresh)
let cache: { at: number; data: PublicNoticeData } | null = null;
let inflight: Promise<PublicNoticeData> | null = null;

function fetchNotices(): Promise<PublicNoticeData> {
  if (cache && Date.now() - cache.at < 55_000) return Promise.resolve(cache.data);
  if (!inflight) {
    inflight = fetch("/api/v1/public-notices/", { headers: { "ngrok-skip-browser-warning": "true" } })
      .then((r) => (r.ok ? r.json() : { notices: [], stre: null }))
      .then((data: PublicNoticeData) => { cache = { at: Date.now(), data }; return data; })
      .catch(() => ({ notices: [], stre: null }))
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function usePublicNotices() {
  const [data, setData] = useState<PublicNoticeData | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetchNotices().then((d) => alive && setData(d));
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  return data;
}

export function shortDate(value?: string | null) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
