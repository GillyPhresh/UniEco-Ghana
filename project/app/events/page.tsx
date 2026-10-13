import Link from 'next/link';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { getPublishedEvents } from '@/lib/data/public-queries';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, Clock, ArrowRight, Building2 } from 'lucide-react';

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

function formatDate(dateString: string | null): string {
  if (!dateString) return 'TBA';
  return new Date(dateString).toLocaleDateString('en-GH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateString: string | null): string {
  if (!dateString) return '';
  return new Date(dateString).toLocaleTimeString('en-GH', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

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

        {events.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No events right now"
            description="New events are added regularly. Check back soon to see what is happening on campus."
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                <div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-accent/15 via-primary/5 to-secondary/10">
                  <Calendar className="h-12 w-12 text-primary/30" />
                  {event.university && (
                    <Badge variant="secondary" className="absolute right-3 top-3">
                      {event.university.short_name}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors">
                    {event.title}
                  </h2>
                  {event.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {event.description}
                    </p>
                  )}
                  <div className="mt-auto space-y-2 pt-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0 text-primary" />
                      {formatDate(event.start_time)}
                      {event.start_time && ` · ${formatTime(event.start_time)}`}
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{event.location}</span>
                      </div>
                    )}
                    {event.university && (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">Organized by {event.university.name}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center text-sm font-medium text-primary group-hover:gap-2 transition-all">
                    View details
                    <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
