import type { Metadata } from 'next';
import { createPublicPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = createPublicPageMetadata({
  title: 'Find Campus Businesses in Ghana',
  description: 'Discover campus businesses and student vendors by category, university, and region with UniEco Ghana.',
  path: '/discover',
});

export default function DiscoverLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
