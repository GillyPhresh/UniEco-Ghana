'use client';

import Link from 'next/link';
import { Calendar, MapPin, Clock, Building2 } from 'lucide-react';
import { Section, SectionHeading, Reveal } from '@/components/landing/section';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface EventPreviewItem {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  university: { id: string; name: string; short_name: string; slug: string } | null;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'TBA';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-GH', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function EventsPreview({ events }: { events: EventPreviewItem[] }) {
  if (events.length === 0) return null;

  return (
    <Section id="events" className="bg-muted/30">
      <div className="flex items-end justify-between">
        <SectionHeading
          eyebrow="Events"
          title="What's happening on campus"
          description="Fairs, festivals, sports, and gatherings — see what is coming up at UENR."
          align="left"
        />
        <Button asChild variant="ghost" size="sm" className="hidden shrink-0 sm:inline-flex">
          <Link href="/events">View all</Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event, i) => (
          <Reveal key={event.id} delay={i * 0.08}>
            <Link
              href={`/events/${event.slug}`}
              className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
            >
              <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-accent/15 via-primary/5 to-secondary/10">
                <Calendar className="h-10 w-10 text-primary/40" />
                {event.university && (
                  <Badge variant="secondary" className="absolute right-3 top-3">
                    {event.university.short_name}
                  </Badge>
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {event.title}
                </h3>
                {event.description && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                    {event.description}
                  </p>
                )}
                <div className="mt-auto space-y-1.5 pt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    {formatDate(event.start_time)}
                    {event.start_time && ` · ${formatTime(event.start_time)}`}
                  </div>
                  {event.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      <span className="truncate">{event.location}</span>
                    </div>
                  )}
                  {event.university && (
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-primary" />
                      <span className="truncate">Organized by {event.university.short_name}</span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>

      <div className="mt-8 text-center sm:hidden">
        <Button asChild variant="outline">
          <Link href="/events">View all events</Link>
        </Button>
      </div>
    </Section>
  );
}
