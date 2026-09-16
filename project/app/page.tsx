import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register';

export const dynamic = 'force-dynamic';

import { Hero } from '@/components/landing/hero';
import { PlatformOverview } from '@/components/landing/platform-overview';
import { Features } from '@/components/landing/features';
import { UniversitySection } from '@/components/landing/university-section';
import { FeaturedBusinesses } from '@/components/landing/featured-businesses';
import { CategorySection } from '@/components/landing/category-section';
import { EventsPreview } from '@/components/landing/events-preview';
import { TrustSection } from '@/components/landing/trust-section';
import { StudentBenefits } from '@/components/landing/student-benefits';
import { VendorBenefits } from '@/components/landing/vendor-benefits';
import { UniversityBenefits } from '@/components/landing/university-benefits';
import { Statistics } from '@/components/landing/statistics';
import { Testimonials } from '@/components/landing/testimonials';
import { FAQ } from '@/components/landing/faq';
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
    getUniversities(),
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
        <TrustSection />
        <PlatformOverview />
        <Features />
        <StudentBenefits />
        <VendorBenefits />
        <UniversityBenefits />
        <Statistics
          vendorCount={totalVendors}
          universityCount={universities.length}
          reviewCount={totalReviews}
          productCount={totalProducts}
        />
        <Testimonials />
        <FAQ />
        <CallToAction />
      </main>
      <SiteFooter />
    </>
  );
}
