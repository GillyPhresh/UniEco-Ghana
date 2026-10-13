import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/constants/site';
import { getUniversities } from '@/lib/data/public-queries';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${base}/discover`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${base}/categories`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${base}/events`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${base}/search`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${base}/signin`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${base}/signup`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];

  try {
    const universities = await getUniversities();
    const universityEntries: MetadataRoute.Sitemap = universities.map((uni) => ({
      url: `${base}/university/${uni.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
    return [...staticEntries, ...universityEntries];
  } catch {
    return staticEntries;
  }
}
