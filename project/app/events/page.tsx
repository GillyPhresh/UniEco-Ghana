import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { getPublishedEvents } from '@/lib/data/public-queries';
import { EventsBrowser } from '@/components/events/events-browser';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Campus Events in Ghana — Tech Fairs, Food Festivals & More',
  description: 'Discover upcoming events at universities across Ghana — tech fairs, food festivals, career fairs, sports galas, and campus gatherings on UniEco Ghana.',
  keywords: [
    'campus events Ghana',
    'university events Ghana',
    'UENR events',
    'tech fair Ghana',
    'campus festival',
    'university career fair',
  ],
};

export default async function EventsPage() {
  const events = await getPublishedEvents(50);

  return (
    <>
      <SiteHeader />
      <main className="container py-8 sm:py-10">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Campus events
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tech fairs, food festivals, career fairs, sports galas — see what is
            happening at universities across Ghana.
          </p>
        </div>

        <EventsBrowser events={events} />
      </main>
      <SiteFooter />
    </>
  );
}
