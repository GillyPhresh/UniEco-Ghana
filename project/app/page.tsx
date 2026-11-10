import type { Metadata } from 'next';
import { SiteHeader } from '@/components/layout/site-header';
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
        <section aria-labelledby="campus-community-heading" className="h-[calc(100dvh-4rem-3.75rem-env(safe-area-inset-bottom))] min-h-[34rem] overflow-hidden lg:h-[calc(100dvh-4rem)]">
          <h1 id="campus-community-heading" className="sr-only">Campus community feed</h1>
          <CampusCommunityFeed />
        </section>
      </main>
    </>
  );
}
