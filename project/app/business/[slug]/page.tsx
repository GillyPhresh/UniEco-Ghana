import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { BusinessProfileContent } from '@/components/business/business-profile-content';
import {
  getVendorBySlug,
  getVendorLocation,
  getVendorProducts,
  getVendorServices,
  getVendorReviews,
  getRelatedVendors,
} from '@/lib/data/public-queries';
import { siteConfig } from '@/lib/constants/site';

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const vendor = await getVendorBySlug(params.slug);
  if (!vendor) {
    return {
      title: 'Business not found',
      description: 'This business could not be found on UniEco Ghana.',
    };
  }

  const title = `${vendor.business_name} — ${vendor.business_type} | ${siteConfig.name}`;
  const description = vendor.description || `${vendor.business_name} on ${siteConfig.name}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${siteConfig.url}/business/${vendor.business_slug}`,
      siteName: siteConfig.name,
      images: vendor.logo_url ? [{ url: vendor.logo_url }] : undefined,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function BusinessProfilePage({ params }: PageProps) {
  const vendor = await getVendorBySlug(params.slug);
  if (!vendor) notFound();

  const [location, products, services, reviews, relatedVendors] = await Promise.all([
    getVendorLocation(vendor.id),
    getVendorProducts(vendor.id),
    getVendorServices(vendor.id),
    getVendorReviews(vendor.id),
    getRelatedVendors(vendor, 4),
  ]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: vendor.business_name,
    description: vendor.description,
    image: vendor.logo_url,
    telephone: vendor.contact_phone,
    email: vendor.contact_email,
    address: location ? {
      '@type': 'PostalAddress',
      streetAddress: location.address_line,
      addressLocality: location.city,
      addressRegion: location.region,
      addressCountry: 'Ghana',
    } : undefined,
    aggregateRating: vendor.rating_count > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: vendor.rating_avg,
      reviewCount: vendor.rating_count,
    } : undefined,
    url: `${siteConfig.url}/business/${vendor.business_slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />
      <main>
        <BusinessProfileContent
          vendor={vendor}
          location={location}
          products={products}
          services={services}
          reviews={reviews}
          relatedVendors={relatedVendors}
        />
      </main>
      <SiteFooter />
    </>
  );
}
