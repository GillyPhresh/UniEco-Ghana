import type { Metadata } from 'next';
import { siteConfig } from '@/lib/constants/site';

type PublicPageMetadata = {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  imageAlt?: string;
};

export function createPublicPageMetadata({ title, description, path, image, imageAlt }: PublicPageMetadata): Metadata {
  const canonical = new URL(path, siteConfig.url).toString();
  const previewImage = image || '/unieco-official-logo.png';
  const previewAlt = imageAlt || 'UniEco Ghana — campus marketplace and community';

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      locale: siteConfig.locale,
      url: canonical,
      siteName: siteConfig.name,
      title,
      description,
      images: [{ url: previewImage, alt: previewAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: previewImage, alt: previewAlt }],
    },
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
