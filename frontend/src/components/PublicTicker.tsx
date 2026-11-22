"use client";
import Link from "next/link";
import { shortDate, usePublicNotices } from "@/lib/publicNotices";
import Icon from "@/components/Icon";

/** Home page ke upar chalti hui patti (marquee): STRE + public notices. Hover/touch par ruk jaati hai. */
export default function PublicTicker() {
  const data = usePublicNotices();
  const items: { key: string; text: string; href: string }[] = [];
  if (data?.stre_result) items.push({ key: "stre-result", text: `🏆 ${data.stre_result} — result declared. Check your result →`, href: "/stre/result" });
  if (data?.stre) items.push({ key: "stre", text: `STRE registration open — exam ${shortDate(data.stre.exam_date)}, last date ${shortDate(data.stre.last_date)}. Register now →`, href: "/stre" });
  (data?.stre_notices ?? []).forEach((n) => items.push({ key: `stre-${n.id}`, text: `STRE: ${n.is_pinned ? "📌 " : ""}${n.title} →`, href: "/stre" }));
  (data?.notices ?? []).forEach((n) => items.push({ key: n.id, text: `${n.is_pinned ? "📌 " : ""}${n.title}${n.event_date ? ` (${shortDate(n.event_date)})` : ""} — ${n.school}`, href: "/#notices" }));
  if (!items.length) items.push(
    { key: "reg", text: "Student & teacher registration is open for schools on Oshitech ERP →", href: "/register/student" },
    { key: "stre-default", text: "STRE — Student Talent Recognition Exam: check registration & admit card status →", href: "/stre/status" },
  );
  // Do baar repeat taaki patti bina jhatke ke ghoome
  const loop = [...items, ...items];
  return (
    <div className="public-ticker no-print" role="region" aria-label="Latest announcements">
      <span className="public-ticker__label"><Icon name="megaphone" size={14} /> <span className="hidden sm:inline">Latest</span></span>
      <div className="public-ticker__viewport">
        <div className="public-ticker__track" style={{ animationDuration: `${Math.max(18, items.length * 9)}s` }}>
          {loop.map((item, index) => (
            <Link key={`${item.key}-${index}`} href={item.href} className="public-ticker__item" aria-hidden={index >= items.length ? true : undefined} tabIndex={index >= items.length ? -1 : undefined}>
              <span className="public-ticker__dot" />{item.text}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
