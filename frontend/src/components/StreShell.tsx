"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import StreNotices from "@/components/StreNotices";
import StreSupportBox from "@/components/StreSupportBox";

/** Saare STRE public pages ka dhancha: upar notices, beech me page, niche support request. */
export default function StreShell({ children, support = true, notices = true }: { children: React.ReactNode; support?: boolean; notices?: boolean }) {
  const pathname = usePathname();
  const onHome = pathname === "/stre";
  const onStatus = pathname === "/stre/status";

  return (
    <main className="stre-page min-h-screen bg-[#f6f7fb] px-3 pb-24 pt-3 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link href={onHome ? "/" : "/stre"} className="btn-ghost !py-2.5"><Icon name="arrow" size={15} className="rotate-180" /><span className="ml-2">Back</span></Link>
          {!onHome && !onStatus && (
            <Link href="/stre/status" className="btn-primary !py-2.5"><Icon name="ticket" size={15} /><span className="ml-2">Check status</span></Link>
          )}
        </div>
        {notices && <StreNotices />}
        {children}
        {support && <div className="mt-5"><StreSupportBox /></div>}
      </div>
    </main>
  );
}
