import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/constants/site';
import {
  getIndexableEventSlugs,
  getIndexableProductIds,
  getIndexableServiceIds,
  getIndexableVendorSlugs,
  getUniversities,
} from '@/lib/data/public-queries';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${base}/discover`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${base}/marketplace`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${base}/categories`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${base}/events`,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${base}/updates`,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${base}/for-students`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${base}/for-vendors`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${base}/for-universities`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  const [universities, vendors, events, products, services] = await Promise.all([
    getUniversities().catch(() => []),
    getIndexableVendorSlugs().catch(() => []),
    getIndexableEventSlugs().catch(() => []),
    getIndexableProductIds().catch(() => []),
    getIndexableServiceIds().catch(() => []),
  ]);
    const universityEntries: MetadataRoute.Sitemap = universities.map((uni) => ({
      url: `${base}/university/${uni.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
    const vendorEntries: MetadataRoute.Sitemap = vendors.map((vendor) => ({
      url: `${base}/business/${vendor.business_slug}`,
      ...(vendor.updated_at ? { lastModified: new Date(vendor.updated_at) } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
    const eventEntries: MetadataRoute.Sitemap = events.map((event) => ({
      url: `${base}/events/${event.slug}`,
      ...(event.updated_at ? { lastModified: new Date(event.updated_at) } : {}),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }));
    const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
      url: `${base}/marketplace/product/${product.id}`,
      ...(product.updated_at ? { lastModified: new Date(product.updated_at) } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
    const serviceEntries: MetadataRoute.Sitemap = services.map((service) => ({
      url: `${base}/marketplace/service/${service.id}`,
      ...(service.updated_at ? { lastModified: new Date(service.updated_at) } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  return [...staticEntries, ...universityEntries, ...vendorEntries, ...eventEntries, ...productEntries, ...serviceEntries];
}
