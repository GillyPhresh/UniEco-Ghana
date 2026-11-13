import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { getPublishedEvents, getUniversityBySlug } from '@/lib/data/public-queries';
import { EventsBrowser } from '@/components/events/events-browser';
import { createPublicPageMetadata } from '@/lib/seo/metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const events = await getPublishedEvents(1);
  return {
    ...createPublicPageMetadata({
      title: 'Campus Events in Ghana — Tech Fairs, Food Festivals & More',
      description: 'Discover upcoming events at universities across Ghana — tech fairs, food festivals, career fairs, sports galas, and campus gatherings on UniEco Ghana.',
      path: '/events',
    }),
    ...(events.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

interface EventsPageProps {
  searchParams: Promise<{ university?: string }>;
}

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const { university: universitySlug } = await searchParams;
  const campus = universitySlug ? await getUniversityBySlug(universitySlug) : null;
  const events = await getPublishedEvents(campus ? 100 : 50, campus?.id);

  return (
    <>
      <SiteHeader />
      <main className="container py-8 sm:py-10">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {campus ? `Events at ${campus.short_name}` : 'Campus events'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tech fairs, food festivals, career fairs, sports galas — see what is
            {campus ? `Verified upcoming events published for ${campus.name}.` : 'happening at universities across Ghana.'}
          </p>
        </div>

        <EventsBrowser events={events} campusName={campus?.short_name} />
      </main>
      <SiteFooter />
    </>
  );
}
