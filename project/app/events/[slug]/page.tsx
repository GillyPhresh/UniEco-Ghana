import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { getEventBySlug } from '@/lib/data/public-queries';
import { siteConfig } from '@/lib/constants/site';
import { Calendar, MapPin, Clock, Building2, ArrowLeft, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EventReminderButton } from '@/components/communication/event-reminder-button';
import Link from 'next/link';

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const event = await getEventBySlug(params.slug);
  if (!event) {
    return { title: 'Event not found' };
  }

  const title = `${event.title} | ${siteConfig.name}`;
  const description = event.description || `Event at ${event.university?.name || 'UniEco Ghana'}`;

  return {
    title,
    description,
    keywords: [
      event.title,
      `${event.university?.short_name} event`,
      'campus event Ghana',
      event.university?.city || 'Ghana',
    ].filter(Boolean) as string[],
    openGraph: {
      title,
      description,
      url: `${siteConfig.url}/events/${event.slug}`,
      siteName: siteConfig.name,
      images: event.cover_image_url ? [{ url: event.cover_image_url }] : undefined,
    },
  };
}

function formatFullDate(dateString: string | null): string {
  if (!dateString) return 'To be announced';
  return new Date(dateString).toLocaleDateString('en-GH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return '';
  const startTime = new Date(start).toLocaleTimeString('en-GH', { hour: 'numeric', minute: '2-digit' });
  if (!end) return startTime;
  const endTime = new Date(end).toLocaleTimeString('en-GH', { hour: 'numeric', minute: '2-digit' });
  return `${startTime} – ${endTime}`;
}

export default async function EventDetailPage({ params }: PageProps) {
  const event = await getEventBySlug(params.slug);
  if (!event) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description,
    startDate: event.start_time,
    endDate: event.end_time,
    location: {
      '@type': 'Place',
      name: event.location,
    },
    organizer: event.university ? {
      '@type': 'CollegeOrUniversity',
      name: event.university.name,
    } : undefined,
    url: `${siteConfig.url}/events/${event.slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />
      <main className="container py-6 sm:py-8">
        <nav className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/events" className="flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Events
          </Link>
        </nav>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="relative flex h-48 items-center justify-center bg-gradient-to-br from-accent/15 via-primary/5 to-secondary/10 sm:h-64">
            {event.cover_image_url ? (
              <img src={event.cover_image_url} alt={event.title} className="h-full w-full object-cover" />
            ) : (
              <Calendar className="h-16 w-16 text-primary/20" />
            )}
            {event.university && (
              <Badge variant="secondary" className="absolute right-4 top-4">
                {event.university.short_name}
              </Badge>
            )}
          </div>

          <div className="p-4 sm:p-6">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {event.title}
            </h1>
            {event.description && (
              <p className="mt-4 text-sm text-muted-foreground text-pretty sm:text-base">
                {event.description}
              </p>
            )}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
                <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Date</p>
                  <p className="mt-1 text-sm text-foreground">{formatFullDate(event.start_time)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Time</p>
                  <p className="mt-1 text-sm text-foreground">
                    {formatTimeRange(event.start_time, event.end_time) || 'TBA'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Location</p>
                  <p className="mt-1 text-sm text-foreground">{event.location || 'TBA'}</p>
                </div>
              </div>
              {event.university && (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
                  <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Organizer</p>
                    <Link
                      href={`/university/${event.university.slug}`}
                      className="mt-1 block text-sm text-primary hover:underline"
                    >
                      {event.university.name}
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild variant="outline">
                <Link href="/events">Back to all events</Link>
              </Button>
              {event.start_time && new Date(event.start_time) > new Date() && (
                <EventReminderButton
                  eventId={event.id}
                  eventTitle={event.title}
                  eventDate={event.start_time}
                />
              )}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
