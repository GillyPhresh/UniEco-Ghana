import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register';

export const dynamic = 'force-dynamic';

import { Hero } from '@/components/landing/hero';
import { UniversitySection } from '@/components/landing/university-section';
import { FeaturedBusinesses } from '@/components/landing/featured-businesses';
import { CategorySection } from '@/components/landing/category-section';
import { EventsPreview } from '@/components/landing/events-preview';
import { CallToAction } from '@/components/landing/call-to-action';
import {
  getUniversities,
  getFeaturedVendors,
  getPublishedEvents,
  getCategoryCounts,
  getVendorCountByUniversity,
  getTotalVendorCount,
  getTotalReviewCount,
  getTotalProductCount,
} from '@/lib/data/public-queries';

export default async function Home() {
  const [universities, featuredVendors, events, categoryCounts, totalVendors, totalReviews, totalProducts] = await Promise.all([
    getUniversities(6),
    getFeaturedVendors(8),
    getPublishedEvents(3),
    getCategoryCounts(),
    getTotalVendorCount(),
    getTotalReviewCount(),
    getTotalProductCount(),
  ]);

  const vendorCounts: Record<string, number> = {};
  for (const uni of universities) {
    vendorCounts[uni.id] = await getVendorCountByUniversity(uni.id);
  }

  return (
    <>
      <ServiceWorkerRegister />
      <SiteHeader />
      <main>
        <Hero
          vendorCount={totalVendors}
          universityCount={universities.length}
          reviewCount={totalReviews}
        />
        <UniversitySection universities={universities} vendorCounts={vendorCounts} />
        <FeaturedBusinesses vendors={featuredVendors} />
        <CategorySection categoryCounts={categoryCounts} />
        <EventsPreview events={events} />
        <CallToAction />
      </main>
      <SiteFooter />
    </>
  );
}
