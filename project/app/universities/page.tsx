import Link from 'next/link';
import { ArrowUpRight, GraduationCap } from 'lucide-react';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { UniversityDirectory } from '@/components/universities/university-directory';
import { getUniversityDirectory } from '@/lib/data/public-queries';
import { createPublicPageMetadata } from '@/lib/seo/metadata';
import { presentDirectoryCampus } from '@/lib/data/campus-presentation';

export const metadata = createPublicPageMetadata({
  title: 'Ghana Tertiary Institution Directory',
  description: 'Explore Ghanaian universities, Colleges of Education, and health training colleges. Search institution profiles by name, type, city, or region.',
  path: '/universities',
});

// The directory is public data. A short cache keeps mobile navigation quick
// while still allowing newly approved branding to appear without a deploy.
export const revalidate = 300;

export default async function UniversitiesPage() {
  const rows = await getUniversityDirectory().catch(() => null);
  const universities = rows?.map(presentDirectoryCampus) || [];
  const regionCount = new Set(universities.flatMap((university) => university.region || [])).size;
  return (
    <>
      <SiteHeader />
      <main className="container py-5 sm:py-8">
        <div className="relative isolate mb-4 overflow-hidden rounded-[1.75rem] border border-emerald-900/25 bg-[#082b27] px-4 py-5 text-white sm:mb-7 sm:rounded-[2rem] sm:px-9 sm:py-10 lg:px-12">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_95%_0%,#1c6755,transparent_66%),repeating-linear-gradient(138deg,transparent_0_40px,#ffffff08_41px_42px)]" />
          <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-5">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-emerald-200"><GraduationCap className="h-5 w-5" aria-hidden="true" /> Ghana tertiary directory</p>
              <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight sm:mt-3 sm:text-4xl lg:text-5xl">Find your campus</h1>
              <p className="mt-2 text-sm leading-6 text-emerald-50/85 sm:hidden">Find school information, events, and nearby businesses.</p>
              <p className="mt-3 hidden max-w-lg text-base leading-6 text-emerald-50/85 sm:block">Explore Ghana’s universities, Colleges of Education, and health training colleges. Find school information, events, and businesses around campus.</p>
            </div>
            {universities.length > 0 && <p className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white sm:px-4 sm:py-2 sm:text-sm">{universities.length} schools{regionCount > 0 && ` · ${regionCount} regions`}</p>}
          </div>
        </div>
        {rows ? <UniversityDirectory universities={universities} /> : <div role="alert" className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-semibold">The campus directory couldn’t load</h2>
          <p className="mt-1 text-sm text-muted-foreground">Please try again in a moment.</p>
          <Link href="/universities" prefetch={false} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">Try again <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>}
      </main>
      <SiteFooter />
    </>
  );
}
