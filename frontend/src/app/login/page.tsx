"use client";
import Link from "next/link";
import { Fragment } from "react";
import LogoutReasonBanner from "@/components/LogoutReasonBanner";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/lib/auth";
import { PORTALS } from "@/lib/portals";
import { ROLE_LABEL } from "@/lib/types";
import Icon from "@/components/Icon";

export default function LoginPage() {
  const { user } = useAuth();

  return <main className="auth-page relative flex min-h-[100dvh] items-start justify-center overflow-hidden bg-[#f6f7fb] px-3 pb-24 pt-3 sm:px-5 sm:py-12 lg:items-center">
    <div className="absolute -left-40 -top-44 h-[480px] w-[480px] rounded-full bg-indigo-200/40 blur-3xl" /><div className="absolute -bottom-44 -right-36 h-[480px] w-[480px] rounded-full bg-sky-100/90 blur-3xl" />
    <section className="relative w-full max-w-5xl animate-rise-in overflow-hidden rounded-[30px] border border-white bg-white/90 shadow-2xl shadow-slate-200/80 backdrop-blur">
      <div className="bg-[#172238] px-6 py-7 text-white sm:px-10 sm:py-8"><div className="flex flex-wrap items-center justify-between gap-4"><Link href="/" className="inline-flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-lg font-bold">O</span><span><span className="block text-sm font-semibold">Oshitech</span><span className="text-[9px] uppercase tracking-[.2em] text-slate-400">Education ERP</span></span></Link><div className="flex items-center gap-2"><ThemeToggle /><Link href="/" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.14] sm:px-4 sm:text-sm"><Icon name="home" size={15} />Back to homepage</Link></div></div><div className="mt-7 max-w-xl"><p className="text-xs font-semibold uppercase tracking-[.18em] text-indigo-200">Secure portal access</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Choose your sign in</h1><p className="mt-2 text-sm leading-6 text-slate-300">Choose the portal for your role. Your school or platform administrator shares your account credentials.</p></div></div>
      {user && <div className="border-b border-slate-100 bg-indigo-50/70 px-6 py-3 text-center text-xs text-indigo-800 sm:px-8">Signed in as {ROLE_LABEL[user.role]}. Choose another portal below to switch accounts.</div>}
      <div className="px-5 pt-5 sm:px-8 sm:pt-6"><LogoutReasonBanner /></div><div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-8">{PORTALS.map((portal) => <Fragment key={portal.slug}><Link href={`/login/${portal.slug}`} className="group flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100/50 sm:p-5"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${portal.tone}`}><Icon name={portal.icon} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{portal.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{portal.subtitle}</span></span><span className="text-lg text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-600"><Icon name="arrow" size={18} /></span></Link></Fragment>)}</div>
      <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 text-center sm:px-8"><p className="text-xs text-slate-500">Student or teacher? Submit an application; school admin approval is required before access.</p></div>
    </section>
  </main>;
}
