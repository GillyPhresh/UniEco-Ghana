import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/constants/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api',
          '/auth',
          '/admin',
          '/dashboard',
          '/vendor-dashboard',
          '/profile',
          '/orders',
          '/cart',
          '/checkout',
          '/payments',
          '/wishlist',
          '/onboarding',
        ],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
