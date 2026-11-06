import type { Metadata } from 'next';
import { SiteHeader } from '@/components/layout/site-header';
import { CampusCommunityFeed } from '@/components/feed/campus-community-feed';

export const metadata: Metadata = {
  title: 'Campus Community',
  description: 'See real campus moments shared by students and vendors across Ghana.',
};

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="h-[calc(100dvh-4rem-3.75rem-env(safe-area-inset-bottom))] overflow-hidden lg:h-[calc(100dvh-4rem)]">
        <CampusCommunityFeed />
      </main>
    </>
  );
}
