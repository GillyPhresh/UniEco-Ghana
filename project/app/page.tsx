import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

export const dynamic = 'force-dynamic';

import { Hero } from '@/components/landing/hero';
import { UniversitySection } from '@/components/landing/university-section';
import { FeaturedBusinesses } from '@/components/landing/featured-businesses';
import { CategorySection } from '@/components/landing/category-section';
import { EventsPreview } from '@/components/landing/events-preview';
import { CallToAction } from '@/components/landing/call-to-action';
import {
  getUniversities,
  getTotalUniversityCount,
  getFeaturedVendors,
  getPublishedEvents,
  getCategoryCounts,
  getVendorCountByUniversity,
  getTotalVendorCount,
  getTotalProductCount,
} from '@/lib/data/public-queries';

export default async function Home() {
  const [universities, featuredVendors, events, categoryCounts, totalVendors, totalUniversities, totalProducts] = await Promise.all([
    getUniversities(6),
    getFeaturedVendors(8),
    getPublishedEvents(3),
    getCategoryCounts(),
    getTotalVendorCount(),
    getTotalUniversityCount(),
    getTotalProductCount(),
  ]);

  const vendorCountEntries = await Promise.all(
    universities.map(async (uni) => [uni.id, await getVendorCountByUniversity(uni.id)] as const),
  );
  const vendorCounts = Object.fromEntries(vendorCountEntries);

  return (
    <>
      <SiteHeader />
      <main>
        <Hero
          vendorCount={totalVendors}
          universityCount={totalUniversities}
          productCount={totalProducts}
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
