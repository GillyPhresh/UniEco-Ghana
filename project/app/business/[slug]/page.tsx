import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { BusinessProfileContent } from '@/components/business/business-profile-content';
import {
  getVendorBySlug,
  getVendorLocation,
  getVendorGallery,
  getVendorProducts,
  getVendorServices,
  getVendorReviews,
  getRelatedVendors,
} from '@/lib/data/public-queries';
import { siteConfig } from '@/lib/constants/site';
import { createPublicPageMetadata, serializeJsonLd } from '@/lib/seo/metadata';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);
  if (!vendor) return { title: 'Business not found', robots: { index: false, follow: false } };

  const title = `${vendor.business_name} — ${vendor.business_type}`;
  const description = (vendor.description || `${vendor.business_name} on ${siteConfig.name}`).slice(0, 300);
  return createPublicPageMetadata({
    title,
    description,
    path: `/business/${vendor.business_slug}`,
    image: vendor.logo_url,
    imageAlt: `${vendor.business_name} on UniEco Ghana`,
  });
}

export default async function BusinessProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);
  if (!vendor) notFound();

  const [location, gallery, products, services, reviews, relatedVendors] = await Promise.all([
    getVendorLocation(vendor.id),
    getVendorGallery(vendor.id),
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
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <SiteHeader />
      <main>
        <BusinessProfileContent
          vendor={vendor}
          location={location}
          gallery={gallery}
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
