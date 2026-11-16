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
        <CampusCommunityFeed />
      </main>
    </>
  );
}
