import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";

export const metadata: Metadata = {
  title: "Scheduled maintenance | Oshitech Education ERP",
  description: "Oshitech is temporarily unavailable while we make platform updates.",
};

const updates = [
  { icon: "settings", title: "Platform improvements", text: "We are applying an update to the Oshitech workspace." },
  { icon: "shield", title: "Your records matter", text: "Your school data will be here when the update is complete." },
  { icon: "clock", title: "Please check back", text: "We will reopen access as soon as maintenance is finished." },
];

export default function MaintenancePage() {
  return (
    <main className="maintenance-page relative isolate min-h-screen overflow-hidden bg-[#f7f8fc] text-slate-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 -top-52 h-[520px] w-[520px] rounded-full bg-indigo-200/50 blur-[110px]" />
        <div className="absolute -right-36 top-24 h-[460px] w-[460px] rounded-full bg-cyan-100/70 blur-[110px]" />
        <div className="absolute bottom-[-250px] left-[35%] h-[480px] w-[480px] rounded-full bg-violet-100/70 blur-[120px]" />
      </div>

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#20274a] text-lg font-bold text-white shadow-lg shadow-indigo-200/60">O</span>
          <span>
            <span className="block text-sm font-bold tracking-tight">Oshitech</span>
            <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-[.2em] text-slate-500">Education ERP</span>
          </span>
        </div>
        
      </header>

      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-12 lg:grid-cols-[1.08fr_.92fr] lg:gap-16 lg:pt-16">
        <div className="animate-rise-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3.5 py-2 text-[11px] font-semibold text-indigo-700 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-600" />
            </span>
            Scheduled maintenance
          </div>
          <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-.04em] sm:text-5xl lg:text-[58px]">
            We&apos;re making your school workspace <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 bg-clip-text text-transparent">even better.</span>
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
            Oshitech is temporarily unavailable while we make platform updates. Please check back in a little while; we&apos;ll be ready for you as soon as the work is complete.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/maintenance" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#20274a] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/15 transition hover:-translate-y-0.5 hover:bg-indigo-700">
              Check again <Icon name="arrow" size={16} />
            </Link>
            <Link href="/support" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-white">
              <Icon name="ticket" size={16} /> Need help?
            </Link>
          </div>
          <p className="mt-5 inline-flex items-center gap-2 text-xs text-slate-500">
            <Icon name="shield" size={15} className="text-emerald-600" />
            No action is needed from your side.
          </p>
        </div>

        <aside className="maintenance-panel relative overflow-hidden rounded-[28px] border border-white/80 bg-white/80 p-5 shadow-2xl shadow-indigo-900/[0.08] backdrop-blur-xl sm:p-7">
          <div aria-hidden="true" className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gradient-to-br from-indigo-200/60 to-cyan-100/20 blur-2xl" />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Oshitech status</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Update in progress</h2>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/25">
                <Icon name="settings" size={22} />
              </span>
            </div>

            <div className="my-7 flex items-center justify-center">
              <div className="maintenance-orbit relative grid h-48 w-48 place-items-center rounded-full border border-indigo-200/70 bg-gradient-to-br from-white to-indigo-50 shadow-inner sm:h-56 sm:w-56">
                <div aria-hidden="true" className="maintenance-orbit__track absolute inset-4 rounded-full border border-dashed border-indigo-300/80">
                  <span className="absolute -right-1.5 top-6 h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_18px_4px_rgb(34_211_238_/_25%)]" />
                  <span className="absolute -bottom-1.5 left-8 h-2.5 w-2.5 rounded-full bg-violet-400 shadow-[0_0_18px_4px_rgb(167_139_250_/_25%)]" />
                </div>
                <span className="relative grid h-24 w-24 place-items-center rounded-[28px] bg-[#172238] text-white shadow-xl shadow-indigo-950/25 sm:h-28 sm:w-28">
                  <Icon name="layers" size={42} strokeWidth={1.5} />
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-indigo-600 shadow-sm"><Icon name="clock" size={16} /></span>
              <div>
                <p className="text-xs font-semibold text-slate-800">We&apos;ll be back soon</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">Thanks for your patience while we improve your experience.</p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section aria-label="Maintenance details" className="relative mx-auto max-w-6xl px-5 pb-12 sm:px-8 sm:pb-16">
        <div className="grid gap-3 sm:grid-cols-3">
          {updates.map((update) => (
            <article key={update.title} className="maintenance-feature flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/75 p-4 shadow-sm backdrop-blur sm:p-5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon name={update.icon} size={17} /></span>
              <div>
                <h2 className="text-xs font-semibold text-slate-900">{update.title}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-600">{update.text}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-8 text-center text-[11px] text-slate-500">Oshitech Education ERP <span className="px-1.5 text-slate-300">·</span> A better connected school day is on its way.</p>
      </section>
    </main>
  );
}
