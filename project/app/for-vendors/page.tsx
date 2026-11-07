import type { Metadata } from 'next';
import { SeoLandingPage } from '@/components/landing/seo-landing-page';
import { createPublicPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = createPublicPageMetadata({
  title: 'Promote a Campus Business to Students in Ghana',
  description: 'Learn how campus businesses and student entrepreneurs can create a UniEco Ghana profile and reach nearby university communities.',
  path: '/for-vendors',
});

export default function ForVendorsPage() {
  return <SeoLandingPage
    eyebrow="For campus businesses"
    title="Help students discover what your business offers"
    introduction="UniEco Ghana gives campus businesses and student entrepreneurs a place to present their business, services, and products to university communities. Build a useful, accurate profile so students can understand what you offer and how to reach you."
    primaryHref="/signup"
    primaryLabel="Create an account"
    secondaryHref="/discover"
    secondaryLabel="Explore the business directory"
    sections={[
      { title: 'Create a clear business listing', body: 'Describe your products or services in your own words, choose the categories that fit, and provide current contact and campus details. Use original photos and keep availability, opening hours, and prices up to date.' },
      { title: 'Build trust with complete information', body: 'Accurate details make it easier for students to decide whether a listing fits their needs. Complete the platform’s business and verification steps where required. Verification status is shown according to UniEco’s review process; it is not a guarantee of a particular sale or result.' },
      { title: 'Reach the right campus community', body: 'Profiles are discoverable through UniEco’s business directory and marketplace. Visibility depends on the information you provide, platform eligibility, and whether students are searching in your area—no search placement or sales volume is promised.' },
      { title: 'Start with the vendor registration flow', body: 'Create an account, follow the vendor onboarding instructions, and submit the requested business details for review. Keep business claims factual and only list items or services you can actually provide.' },
    ]}
  />;
}
