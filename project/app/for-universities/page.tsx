import type { Metadata } from 'next';
import { SeoLandingPage } from '@/components/landing/seo-landing-page';
import { createPublicPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = createPublicPageMetadata({
  title: 'University Directory and Campus Network in Ghana',
  description: 'Explore Ghanaian tertiary institutions on UniEco and learn how university teams can manage their campus presence and community updates.',
  path: '/for-universities',
});

export default function ForUniversitiesPage() {
  return <SeoLandingPage
    eyebrow="For universities"
    title="Give your campus a clear place in Ghana’s digital campus network"
    introduction="UniEco Ghana connects public university discovery with campus businesses, events, and community updates. Institution profiles help students and visitors find basic campus information and explore what is available through the network."
    primaryHref="/universities"
    primaryLabel="Explore the university directory"
    secondaryHref="/university-admin/apply"
    secondaryLabel="Learn about campus administration"
    sections={[
      { title: 'A searchable tertiary institution directory', body: 'Browse institution profiles by name, abbreviation, city, region, or an established alias. Profile details and branding depend on information available and approved for publication; directory inclusion does not by itself imply an institutional partnership or endorsement.' },
      { title: 'Campus businesses and services', body: 'Students can explore local businesses and services associated with participating campuses. University teams can help keep relevant institution details current, while vendor information remains the responsibility of each listed business and UniEco’s review processes.' },
      { title: 'Events and source-linked updates', body: 'Published campus events and university updates help people discover what is happening. Updates point readers to their original sources, and event visibility follows the platform’s moderation and publication controls.' },
      { title: 'Institution representatives', body: 'University representatives can learn about the scoped administrator application process. Access is reviewed and assigned through UniEco’s governance workflow; this page does not imply that a particular institution has appointed or endorsed an administrator.' },
    ]}
  />;
}
