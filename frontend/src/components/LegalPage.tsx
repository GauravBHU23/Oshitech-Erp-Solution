import Link from "next/link";
import MarketingFooter from "@/components/MarketingFooter";
import SiteHeader from "@/components/SiteHeader";

export type LegalSection = { id: string; title: string; body: (string | string[])[] };

/** Terms / Privacy jaise pages ka common layout: header, table of contents, sections, footer. */
export default function LegalPage({ kicker, title, updated, intro, sections }: { kicker: string; title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <main className="home-page legal-page min-h-screen bg-white text-slate-900">
      <SiteHeader />
      <section className="bg-[#0e172a] px-4 py-10 text-white sm:px-8 sm:py-14">
        <div className="mx-auto max-w-4xl">
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-indigo-200">{kicker}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{intro}</p>
          <p className="mt-4 text-xs text-slate-400">Last updated: {updated}</p>
        </div>
      </section>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">On this page</p>
            <ol className="mt-3 space-y-2 text-sm">
              {sections.map((s, i) => <li key={s.id}><a href={`#${s.id}`} className="text-slate-600 hover:text-indigo-700">{i + 1}. {s.title}</a></li>)}
            </ol>
          </div>
        </nav>
        <article className="min-w-0 space-y-8">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">{i + 1}. {s.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">
                {s.body.map((block, j) => Array.isArray(block) ? (
                  <ul key={j} className="list-disc space-y-1.5 pl-5">{block.map((item) => <li key={item}>{item}</li>)}</ul>
                ) : <p key={j}>{block}</p>)}
              </div>
            </section>
          ))}
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-900">
            Questions about this page? <Link href="/contact" className="font-semibold underline">Contact us</Link> — we usually reply within 2 working days.
          </div>
        </article>
      </div>
      <MarketingFooter />
    </main>
  );
}
