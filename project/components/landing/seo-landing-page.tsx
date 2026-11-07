import Link from 'next/link';
import { ArrowRight, Building2, CalendarDays, Search, Store } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

type SeoLandingPageProps = {
  eyebrow: string;
  title: string;
  introduction: string;
  sections: Array<{ title: string; body: string }>;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
};

const exploreLinks = [
  { href: '/marketplace', label: 'Campus marketplace', icon: Store },
  { href: '/universities', label: 'University directory', icon: Building2 },
  { href: '/events', label: 'Campus events', icon: CalendarDays },
  { href: '/discover', label: 'Find campus businesses', icon: Search },
];

export function SeoLandingPage({ eyebrow, title, introduction, sections, primaryHref, primaryLabel, secondaryHref, secondaryLabel }: SeoLandingPageProps) {
  return <>
    <SiteHeader />
    <main id="main-content">
      <section className="border-b bg-gradient-to-br from-emerald-950 via-slate-950 to-[#102a43] text-white">
        <div className="container py-12 sm:py-20 lg:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{eyebrow}</p>
          <h1 className="mt-4 max-w-4xl font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-white/75 sm:text-lg sm:leading-8">{introduction}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={primaryHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400">{primaryLabel}<ArrowRight className="h-4 w-4" /></Link>
            <Link href={secondaryHref} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/25 px-5 text-sm font-semibold text-white transition hover:bg-white/10">{secondaryLabel}</Link>
          </div>
        </div>
      </section>
      <div className="container grid gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16">
        <div className="space-y-10">
          {sections.map((section) => <section key={section.title}>
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{section.title}</h2>
            <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">{section.body}</p>
          </section>)}
        </div>
        <aside className="h-fit rounded-2xl border bg-card p-5 shadow-sm lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-bold">Explore UniEco Ghana</h2>
          <ul className="mt-3 divide-y">
            {exploreLinks.map(({ href, label, icon: Icon }) => <li key={href}>
              <Link href={href} className="flex min-h-12 items-center gap-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-primary"><Icon className="h-4 w-4 shrink-0 text-primary" />{label}<ArrowRight className="ml-auto h-4 w-4" /></Link>
            </li>)}
          </ul>
        </aside>
      </div>
    </main>
    <SiteFooter />
  </>;
}
