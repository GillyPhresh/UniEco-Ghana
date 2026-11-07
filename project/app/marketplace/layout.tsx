import { getIndexableProductIds, getIndexableServiceIds } from '@/lib/data/public-queries';
import { createPublicPageMetadata } from '@/lib/seo/metadata';

export async function generateMetadata() {
  const [products, services] = await Promise.all([getIndexableProductIds(1), getIndexableServiceIds(1)]);
  return {
    ...createPublicPageMetadata({
      title: 'Campus Marketplace in Ghana',
      description: 'Browse campus products, services, and businesses from Ghanaian university communities on UniEco Ghana.',
      path: '/marketplace',
    }),
    ...(products.length + services.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default function MarketplaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
