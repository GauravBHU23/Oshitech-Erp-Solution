import Link from "next/link";
import Icon from "@/components/Icon";

export default function NotFound() {
  return (
    <main className="not-found-page relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f7fb] px-5 py-12">
      <div className="absolute -left-36 -top-40 h-[460px] w-[460px] rounded-full bg-indigo-200/40 blur-3xl" />
      <div className="absolute -bottom-44 -right-32 h-[460px] w-[460px] rounded-full bg-sky-100/80 blur-3xl" />
      
      <section className="not-found-panel relative w-full max-w-xl animate-rise-in rounded-[30px] border border-white bg-white/90 px-6 py-10 text-center shadow-xl shadow-slate-200/70 backdrop-blur sm:px-12 sm:py-14">
        <Link href="/" className="mx-auto inline-flex items-center gap-2.5 rounded-full border border-slate-100 bg-white px-3 py-2 shadow-sm">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#20274a] text-sm font-bold text-white">O</span>
          <span className="text-sm font-semibold text-slate-800">Oshitech <span className="font-normal text-slate-400">ERP</span></span>
        </Link>
        <div className="relative mx-auto mt-8 grid h-36 w-52 place-items-center sm:h-40 sm:w-60" aria-hidden="true">
          <div className="not-found-art absolute inset-0 rounded-[28px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50 shadow-inner" />
          <div className="absolute left-1/2 top-3 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-indigo-300" />
          <div className="relative flex items-center gap-1 font-bold leading-none tracking-[-.06em] text-[#20274a]"><span className="text-6xl sm:text-7xl">4</span><span className="-mt-2 text-5xl text-indigo-500 sm:text-6xl">0</span><span className="text-6xl sm:text-7xl">4</span></div>
          <div className="absolute bottom-3 h-1 w-12 rounded-full bg-indigo-100" />
        </div>
        <p className="mt-7 text-xs font-semibold uppercase tracking-[.2em] text-indigo-600">Page not found</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Looks like this page took a wrong turn.</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">The link may be old, or the page may have moved. Head back to the Oshitech home page or sign in to your portal.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/" className="btn-primary !px-5 !py-3">Back to homepage <Icon name="arrow" className="ml-2" size={16} /></Link>
          <Link href="/login" className="btn-ghost !px-5 !py-3">Portal sign in</Link>
        </div>
        <p className="mt-8 text-xs text-slate-400">Oshitech Education ERP <span className="px-1.5">·</span> School workspace</p>
      </section>
    </main>
  );
}
