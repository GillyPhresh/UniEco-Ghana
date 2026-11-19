import type { Metadata } from 'next';
import { CampusCommunityFeed } from '@/components/feed/campus-community-feed';
import { createPublicPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = createPublicPageMetadata({
  title: 'UniEco Ghana',
  description: 'Discover campus businesses, student services, university events, and community updates with UniEco Ghana.',
  path: '/',
});

export default function Home() {
  return <CampusCommunityFeed />;
}
