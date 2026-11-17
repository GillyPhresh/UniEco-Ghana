import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/constants/site';
import { COURIER_WORK_PATH } from '@/lib/courier/domain';

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
          COURIER_WORK_PATH,
          '/cart',
          '/checkout',
          '/payments',
          '/wishlist',
          '/onboarding',
          '/community/saved',
        ],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
