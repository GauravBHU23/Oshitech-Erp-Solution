"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { shortDate, usePublicNotices } from "@/lib/publicNotices";
import Icon from "@/components/Icon";

const capitalizeWords = (text: string) =>
  text.replace(/(^|[^\p{L}\p{M}]+)(\p{L})/gu, (_match, separator: string, letter: string) => `${separator}${letter.toLocaleUpperCase("en-IN")}`);

/** Home page ke upar chalti hui patti (marquee): STRE + public notices. Hover/touch par ruk jaati hai. */
export default function PublicTicker() {
  const data = usePublicNotices();
  const viewportRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [animation, setAnimation] = useState({ shift: "-100vw", duration: "20s" });
  const items: { key: string; text: string; href: string }[] = [];
  if (data?.stre) items.push({ key: "stre", text: `STRE registration open — exam ${shortDate(data.stre.exam_date)}, last date ${shortDate(data.stre.last_date)}. Register now →`, href: "/stre" });
  (data?.stre_notices ?? []).forEach((n) => items.push({ key: `stre-${n.id}`, text: `STRE: ${n.is_pinned ? "📌 " : ""}${n.title} →`, href: "/stre" }));
  (data?.notices ?? []).forEach((n) => items.push({ key: n.id, text: `${n.is_pinned ? "📌 " : ""}${n.title}${n.event_date ? ` (${shortDate(n.event_date)})` : ""} — ${n.school}`, href: "/#notices" }));
  // Don't show temporary copy while the API is loading; it gets replaced by
  // the real announcement and looks like the ticker text disappeared.
  if (data && !items.length) items.push({ key: "fallback", text: "Latest announcements from Oshitech ERP →", href: "/#notices" });
  const seen = new Set<string>();
  const uniqueItems = items.filter((item) => {
    const normalized = item.text.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-IN");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  const extraAnnouncements = [
    { key: "reg", text: "Student & teacher registration is open for schools on Oshitech ERP →", href: "/register/student" },
    { key: "stre-status", text: "STRE — Student Talent Recognition Exam: check registration & admit card status →", href: "/stre/status" },
  ];
  if (data) {
    for (const item of extraAnnouncements) {
      const normalized = item.text.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-IN");
      if (uniqueItems.length >= 3) break;
      if (!seen.has(normalized)) {
        uniqueItems.push(item);
        seen.add(normalized);
      }
    }
  }

  useEffect(() => {
    const viewport = viewportRef.current;
    const group = groupRef.current;
    if (!viewport || !group) return;

    const measure = () => {
      const distance = viewport.clientWidth + group.getBoundingClientRect().width;
      if (!distance) return;
      setAnimation({ shift: `${-distance}px`, duration: `${distance / 85}s` });
    };

    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(viewport);
    observer?.observe(group);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div className="public-ticker no-print" role="region" aria-label="Latest announcements">
      <span className="public-ticker__label"><Icon name="megaphone" size={14} /> <span className="hidden sm:inline">Latest</span></span>
      <div className="public-ticker__viewport" ref={viewportRef}>
        <div className="public-ticker__track" style={{ "--ticker-shift": animation.shift, animationDuration: animation.duration } as CSSProperties}>
          <div className="public-ticker__group" ref={groupRef}>
            {uniqueItems.map((item) => (
              <Link key={item.key} href={item.href} className="public-ticker__item">
                <span className="public-ticker__dot" />{capitalizeWords(item.text)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
