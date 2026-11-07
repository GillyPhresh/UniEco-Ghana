import { getIndexableVendorSlugs } from '@/lib/data/public-queries';
import { createPublicPageMetadata } from '@/lib/seo/metadata';

export async function generateMetadata() {
  const vendors = await getIndexableVendorSlugs(1);
  return {
    ...createPublicPageMetadata({
      title: 'Find Campus Businesses in Ghana',
      description: 'Discover campus businesses and student vendors by category, university, and region with UniEco Ghana.',
      path: '/discover',
    }),
    ...(vendors.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default function DiscoverLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
