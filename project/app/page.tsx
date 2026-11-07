import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { CampusCommunityFeed } from '@/components/feed/campus-community-feed';
import { createPublicPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = createPublicPageMetadata({
  title: 'Ghana’s Campus Marketplace, Businesses & Community',
  description: 'Discover campus businesses, student services, university events, and community updates with UniEco Ghana.',
  path: '/',
});

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <section className="border-b bg-gradient-to-br from-emerald-950 via-slate-950 to-[#102a43] text-white">
          <div className="container py-12 sm:py-16 lg:py-20">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Your campus. Your marketplace. Your community.</p>
            <h1 className="mt-4 max-w-4xl font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">Discover Ghana’s campus businesses, services and community</h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-white/75 sm:text-lg sm:leading-8">UniEco Ghana helps students explore businesses and everyday services around tertiary campuses, find university information, and follow published events and source-linked campus updates. What is available depends on each campus and its participating members.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/marketplace" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-500 px-5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400">Browse the marketplace</Link>
              <Link href="/universities" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/25 px-5 text-sm font-semibold text-white transition hover:bg-white/10">Explore universities</Link>
            </div>
            <nav aria-label="Explore UniEco Ghana" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-emerald-100">
              <Link className="hover:text-white hover:underline" href="/discover">Find campus businesses</Link>
              <Link className="hover:text-white hover:underline" href="/events">Campus events</Link>
              <Link className="hover:text-white hover:underline" href="/updates">Campus updates</Link>
              <Link className="hover:text-white hover:underline" href="/for-students">For students</Link>
              <Link className="hover:text-white hover:underline" href="/for-vendors">For vendors</Link>
              <Link className="hover:text-white hover:underline" href="/for-universities">For universities</Link>
            </nav>
          </div>
        </section>
        <section aria-labelledby="campus-community-heading" className="h-[calc(100dvh-4rem-3.75rem-env(safe-area-inset-bottom))] min-h-[34rem] overflow-hidden lg:h-[calc(100dvh-4rem)]">
          <h2 id="campus-community-heading" className="sr-only">Campus community feed</h2>
          <CampusCommunityFeed />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
