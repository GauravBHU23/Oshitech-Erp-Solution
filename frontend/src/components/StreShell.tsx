"use client";
import Link from "next/link";
import Icon from "@/components/Icon";
import ThemeToggle from "@/components/ThemeToggle";
import StreNotices from "@/components/StreNotices";
import StreSupportBox from "@/components/StreSupportBox";

/** Saare STRE public pages ka dhancha: upar notices, beech me page, niche support request. */
export default function StreShell({ children, support = true }: { children: React.ReactNode; support?: boolean }) {
  return (
    <main className="stre-page min-h-screen bg-[#f6f7fb] px-3 pb-24 pt-3 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link href="/" className="btn-ghost !py-2.5"><Icon name="home" size={16} /><span className="ml-2">Home</span></Link>
          <span className="flex flex-wrap items-center gap-2"><ThemeToggle /><Link href="/stre/result" className="btn-ghost !py-2.5"><Icon name="award" size={15} /><span className="ml-2">Result</span></Link><Link href="/stre/status" className="btn-primary !py-2.5"><Icon name="ticket" size={15} /><span className="ml-2">Check status / Admit card</span></Link></span>
        </div>
        <StreNotices />
        {children}
        {support && <div className="mt-5"><StreSupportBox /></div>}
      </div>
    </main>
  );
}
