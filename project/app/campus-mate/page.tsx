import type { Metadata } from 'next';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { CampusMateExperience, type CampusMatePlace, type CampusMateUniversity } from '@/components/campus-mate/campus-mate-experience';
import { getEventsByUniversity, getUniversities, getVendorsByUniversity } from '@/lib/data/public-queries';

export const metadata: Metadata = {
  title: 'Campus Mate — Find your way around campus',
  description: 'Find campus businesses, events, services and useful places with UniEco Ghana Campus Mate.',
};

type CampusMatePageProps = {
  searchParams?: Promise<{ campus?: string | string[] }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CampusMatePage({ searchParams }: CampusMatePageProps) {
  const params = searchParams ? await searchParams : {};
  const universities = await getUniversities();
  const requestedCampus = firstParam(params.campus)?.trim().toLowerCase();
  const selectedUniversity = universities.find((university) => university.slug === requestedCampus) || universities[0];

  if (!selectedUniversity) {
    return (
      <>
        <SiteHeader />
        <main className="container px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-bold">Campus Mate is getting ready</h1>
          <p className="mt-2 text-sm text-muted-foreground">University locations will appear here as soon as the campus directory is available.</p>
        </main>
        <SiteFooter />
      </>
    );
  }

  const [vendors, events] = await Promise.all([
    getVendorsByUniversity(selectedUniversity.id, 100),
    getEventsByUniversity(selectedUniversity.id, 50),
  ]);

  const campusUniversity: CampusMateUniversity = {
    id: selectedUniversity.id,
    name: selectedUniversity.name,
    official_name: selectedUniversity.official_name,
    short_name: selectedUniversity.short_name,
    abbreviation: selectedUniversity.abbreviation,
    slug: selectedUniversity.slug,
    city: selectedUniversity.city,
    region: selectedUniversity.region,
    logo_url: selectedUniversity.logo_url,
    hero_image_url: selectedUniversity.hero_image_url,
    landmark_image_url: selectedUniversity.landmark_image_url,
    logo_alt_text: selectedUniversity.logo_alt_text,
  };

  const campusUniversities = universities.map((university) => ({
    id: university.id,
    name: university.name,
    official_name: university.official_name,
    short_name: university.short_name,
    abbreviation: university.abbreviation,
    slug: university.slug,
    city: university.city,
    region: university.region,
    logo_url: university.logo_url,
    hero_image_url: university.hero_image_url,
    landmark_image_url: university.landmark_image_url,
    logo_alt_text: university.logo_alt_text,
  } satisfies CampusMateUniversity));

  const places: CampusMatePlace[] = [
    ...vendors.map((vendor) => {
      const location = Array.isArray(vendor.location) ? vendor.location[0] : vendor.location;
      const locationVerified = vendor.location_verification_status === 'verified';
      return {
        id: vendor.id,
        kind: 'business' as const,
        name: vendor.business_name,
        category: vendor.business_type || 'Other Services',
        description: vendor.description,
        address: location?.address_line || location?.label || null,
        city: location?.city || selectedUniversity.city,
        region: location?.region || selectedUniversity.region,
        latitude: locationVerified ? vendor.gps_latitude ?? location?.latitude ?? null : null,
        longitude: locationVerified ? vendor.gps_longitude ?? location?.longitude ?? null : null,
        image_url: vendor.logo_url || vendor.cover_image_url,
        href: vendor.business_slug ? `/business/${vendor.business_slug}` : null,
        rating: vendor.rating_avg || null,
        verified: vendor.is_verified,
        start_time: null,
      };
    }),
    ...events.map((event) => ({
      id: event.id,
      kind: 'event' as const,
      name: event.title,
      category: 'event',
      description: event.description,
      address: event.location,
      city: selectedUniversity.city,
      region: selectedUniversity.region,
      latitude: null,
      longitude: null,
      image_url: event.cover_image_url,
      href: event.slug ? `/events/${event.slug}` : null,
      rating: null,
      verified: false,
      start_time: event.start_time,
    })),
  ];

  return (
    <>
      <SiteHeader />
      <CampusMateExperience university={campusUniversity} universities={campusUniversities} places={places} />
      <SiteFooter />
    </>
  );
}
