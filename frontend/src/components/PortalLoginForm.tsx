"use client";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LogoutReasonBanner from "@/components/LogoutReasonBanner";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { PortalInfo } from "@/lib/portals";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import PasswordInput from "@/components/PasswordInput";
import TurnstileWidget from "@/components/TurnstileWidget";
import { toast } from "@/lib/toast";

type CaptchaChallenge = { id: string; svg: string };

export default function PortalLoginForm({ portal }: { portal: PortalInfo }) {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaChallenge, setCaptchaChallenge] = useState<CaptchaChallenge | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const accountIssuer = portal.slug === "super-admin"
    ? "platform administrator"
    : portal.slug === "school-admin"
      ? "platform Super Admin"
      : "school administrator";

  const refreshCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaAnswer("");
    try {
      setCaptchaChallenge(await api<CaptchaChallenge>("/auth/captcha/", { silent: true }));
    } catch {
      setCaptchaChallenge(null);
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    toast.clear();
    void refreshCaptcha();
  }, [refreshCaptcha]);

  useEffect(() => {
    if (!loading && user && portal.roles.includes(user.role)) router.replace("/dashboard");
  }, [loading, user, router, portal.roles]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (!captchaChallenge || captchaAnswer.trim().length !== 5) {
        setError("Complete the security check before signing in.");
        return;
      }
      if (!turnstileToken) {
        setError("Complete the security check before signing in.");
        return;
      }
      await login(email, password, portal.roles, { captcha_id: captchaChallenge.id, captcha: captchaAnswer.trim(), turnstile_token: turnstileToken });
      router.replace("/dashboard");
    } catch (loginError: unknown) {
      setError(
        loginError instanceof Error && loginError.message.trim()
          ? loginError.message
          : "Unable to sign in. Check your credentials or contact your administrator."
      );
    } finally { setBusy(false); setTurnstileToken(""); setTurnstileKey((k) => k + 1); void refreshCaptcha(); }
  };

  return <main className="auth-page grid min-h-[100dvh] content-start bg-white lg:content-stretch lg:grid-cols-[1.05fr_.95fr]">
    <section className="portal-login-visual relative isolate hidden overflow-hidden bg-[#172238] px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center" style={{ backgroundImage: `url(${portal.photo})` }} />
      <div aria-hidden="true" className="portal-login-visual__shade pointer-events-none absolute inset-0 z-10" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
        <div className="absolute -right-36 top-20 h-[440px] w-[440px] rounded-full border border-white/[0.08]" /><div className="absolute -right-20 top-36 h-[320px] w-[320px] rounded-full border border-white/[0.08]" /><div className="absolute -bottom-32 -left-20 h-[430px] w-[430px] rounded-full bg-indigo-500/20 blur-3xl" />
      </div>
      <Link href="/" className="relative z-20 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-xl font-bold shadow-lg">O</span><span><span className="block text-sm font-semibold tracking-wide">Oshitech</span><span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Education ERP</span></span></Link>
      <div className="relative z-20 max-w-xl py-12"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-indigo-100"><span className="h-2 w-2 rounded-full bg-emerald-400" />Role based access</div><h1 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">{portal.title}, built around your work.</h1><p className="mt-5 max-w-lg text-base leading-7 text-slate-300">{portal.subtitle}. Sign in with the account created for you by your {accountIssuer}.</p><div className="mt-9 rounded-2xl border border-white/10 bg-white/[0.05] p-5"><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${portal.tone}`}><Icon name={portal.icon} /></span><div><p className="text-sm font-semibold text-white">{portal.title}</p><p className="mt-1 text-xs text-slate-400">Your access stays within your role</p></div></div></div></div>
      <div className="relative z-20 flex items-center justify-between text-xs text-slate-500"><span>Secure access for your education team</span><span>Oshitech ERP</span></div>
    </section>
    <section className="auth-content flex items-start justify-center px-4 pb-24 pt-4 sm:px-10 sm:pt-8 lg:min-h-screen lg:items-center lg:py-10"><div className="w-full max-w-[410px] animate-rise-in">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 sm:mb-7"><Link href="/" className="flex items-center gap-2.5 lg:hidden"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-xl font-bold text-white">O</span><span className="font-semibold text-slate-900">Oshitech <span className="font-normal text-slate-400">ERP</span></span></Link><div className="ml-auto flex flex-wrap items-center justify-end gap-2"><ThemeToggle /><Link href="/" className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:px-3.5 sm:text-sm"><Icon name="home" size={15} />Home</Link><Link href="/login" className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-100 sm:px-4 sm:text-sm"><Icon name="users" size={16} />Switch portal<Icon name="arrow" size={14} /></Link></div></div>
      <LogoutReasonBanner />
      {user && !portal.roles.includes(user.role) && <div role="status" className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs leading-5 text-indigo-800">An account is already signed in. Signing in here will switch to this portal.</div>}
      <div className="mb-6 sm:mb-8"><p className="text-xs font-semibold uppercase tracking-[0.17em] text-indigo-600">{portal.title}</p><h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">Sign in to continue</h2><p className="mt-2 text-sm leading-6 text-slate-500">Use the email and password provided by your {accountIssuer}.</p></div>
      <form onSubmit={submit} className="space-y-5"><label className="block text-sm"><span className="mb-2 block font-medium text-slate-700">Email address</span><input className="input !py-3" type="email" required autoComplete="username" suppressHydrationWarning placeholder={portal.emailPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="block text-sm"><span className="mb-2 flex items-center justify-between gap-2 font-medium text-slate-700">Password<Link href={`/forgot-password?portal=${portal.slug}`} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline">Forgot password?</Link></span><PasswordInput className="input !py-3" required autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><fieldset className="rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-semibold text-slate-700">Security check</legend><div className="flex items-center gap-3"><div className="grid h-[52px] w-[166px] shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-violet-50">{captchaChallenge ? <img src={`data:image/svg+xml,${encodeURIComponent(captchaChallenge.svg)}`} alt="Five character security code" className="h-full w-full object-cover" /> : <span className="text-xs text-slate-500">{captchaLoading ? "Loading check…" : "Check unavailable"}</span>}</div><button type="button" onClick={() => void refreshCaptcha()} disabled={captchaLoading} aria-label="Get a new security code" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">↻</button><label className="min-w-0 flex-1 text-xs"><span className="sr-only">Enter the five character security code</span><input className="input !py-2.5 uppercase" autoComplete="off" inputMode="text" maxLength={5} required value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value.toUpperCase())} placeholder="Enter code" aria-label="Enter the five character security code" /></label></div><p className="mt-2 text-[11px] leading-5 text-slate-500">Enter the five characters shown. The check expires after a few minutes.</p></fieldset><TurnstileWidget token={turnstileToken} onChange={setTurnstileToken} reloadKey={turnstileKey} />{error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}<button className="btn-primary inline-flex w-full items-center justify-center !py-3" disabled={busy || captchaLoading || !captchaChallenge}>{busy ? <><Spinner className="mr-2" />Signing in…</> : `Sign in to ${portal.title.toLowerCase()}`}<Icon name="arrow" className="ml-2" size={16} /></button></form>
      {portal.slug === "stre-admin" ? <Link href="/stre" className="stre-promo mt-7 flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 transition hover:border-violet-300"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-600 text-white"><Icon name="award" size={18} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-900">Student? Register for STRE</span><span className="mt-0.5 block text-[11px] leading-5 text-slate-500">This sign-in is for the exam cell. Students register here.</span></span><Icon name="arrow" size={15} className="shrink-0 text-violet-600" /></Link> : portal.slug === "student" || portal.slug === "teacher" ? <div className="mt-7 flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">New to this school? Registration needs school admin approval.</p><Link href={`/register/${portal.slug}`} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50"><Icon name="userPlus" size={15} />{portal.slug === "student" ? "Student registration" : "Teacher registration"}<Icon name="arrow" size={13} /></Link></div> : <div className="mt-7 flex items-start gap-3 rounded-xl bg-slate-50 p-4"><span className="mt-0.5 text-indigo-600">i</span><p className="text-xs leading-5 text-slate-500">{portal.slug === "super-admin" ? "Super Admin access is reserved for platform operators. Contact the platform owner if you need access." : portal.slug === "school-admin" ? "School Admin accounts are created by a Super Admin when a school is set up. Contact your platform administrator for access." : "Exam Controller accounts are created by your School Admin. Contact your school office for access."}</p></div>}<Link href="/support" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800"><Icon name="ticket" size={14} />Unable to sign in? Report a problem</Link><p className="mt-6 text-center text-xs text-slate-400">Protected school access · Oshitech Education ERP</p>
    </div></section>
  </main>;
}
