import type { Metadata } from 'next';
import { createPublicPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = createPublicPageMetadata({
  title: 'Campus Marketplace in Ghana',
  description: 'Browse campus products, services, and businesses from Ghanaian university communities on UniEco Ghana.',
  path: '/marketplace',
});

export default function MarketplaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
