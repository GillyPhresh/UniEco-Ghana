import type { Metadata } from 'next';
import { SeoLandingPage } from '@/components/landing/seo-landing-page';
import { createPublicPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = createPublicPageMetadata({
  title: 'Campus Marketplace and Services for Students in Ghana',
  description: 'Find campus businesses, everyday student services, university events, and opportunities with UniEco Ghana.',
  path: '/for-students',
});

export default function ForStudentsPage() {
  return <SeoLandingPage
    eyebrow="For students"
    title="Make campus life easier to discover"
    introduction="UniEco Ghana brings campus commerce, student services, university communities, and useful updates into one place. Browse what is available around your campus, then connect with the businesses and people behind each listing."
    primaryHref="/marketplace"
    primaryLabel="Browse the campus marketplace"
    secondaryHref="/universities"
    secondaryLabel="Find your university"
    sections={[
      { title: 'Find everyday services near campus', body: 'Look for food and drinks, printing, fashion, hair and beauty, phone accessories, repairs, laundry, tutoring, photography, and other services. Listings and availability can vary by university and participating business.' },
      { title: 'Explore campus businesses and student vendors', body: 'Use the business directory to compare public profiles, see what a vendor offers, and find contact and location details when provided. A listing is a discovery point; confirm current prices, opening hours, stock, and arrangements directly with the business.' },
      { title: 'Keep up with campus life', body: 'Browse published university events and campus updates alongside the community feed. Updates link back to their original sources so you can check details with the institution or organizer.' },
      { title: 'Choose your campus and take part', body: 'The university directory helps you find institution pages and explore the campus network. Create an account when you are ready to participate in member features such as posting, saving, messaging, or ordering.' },
    ]}
  />;
}
