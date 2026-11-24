export default function LoadingScreen() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f7fb] px-5 py-12" role="status" aria-live="polite">
      <div className="absolute -left-32 -top-40 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />
      <div className="absolute -bottom-40 -right-28 h-96 w-96 rounded-full bg-sky-100/70 blur-3xl" />
      <section className="relative w-full max-w-md animate-rise-in rounded-[28px] border border-white bg-white/90 p-7 text-center shadow-xl shadow-slate-200/70 backdrop-blur sm:p-9">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#20274a] text-2xl font-bold text-white shadow-lg shadow-indigo-200">O</div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[.2em] text-indigo-600">Oshitech Education ERP</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Getting your workspace ready</h1>
        <p className="mt-2 text-sm text-slate-500">Securely connecting to your school portal…</p>
        <div className="mx-auto mt-6 h-1.5 max-w-[220px] overflow-hidden rounded-full bg-slate-100">
          <div className="loading-bar h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-400" />
        </div>
        <div className="mt-8 space-y-3" aria-hidden="true">
          <div className="mx-auto h-3 w-3/4 rounded-full bg-slate-100 loading-shimmer" />
          <div className="mx-auto h-3 w-1/2 rounded-full bg-slate-100 loading-shimmer" />
        </div>
      </section>
    </main>
  );
}
