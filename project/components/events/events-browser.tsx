'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, Building2, Calendar, Clock, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import type { EventItem, University } from '@/lib/types';

type EventWithUniversity = EventItem & { university: Pick<University, 'id' | 'name' | 'short_name' | 'slug'> | null };

const DATE_FILTERS = [
  { value: 'all', label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'later', label: 'Later' },
] as const;

const SORT_OPTIONS = [
  { value: 'soonest', label: 'Soonest first' },
  { value: 'latest', label: 'Latest added' },
  { value: 'name', label: 'Name (A–Z)' },
] as const;

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Date to be announced';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Date to be announced';
  return date.toLocaleDateString('en-GH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GH', { hour: 'numeric', minute: '2-digit' });
}

function matchesDate(event: EventWithUniversity, filter: string) {
  if (filter === 'all') return true;
  if (!event.start_time) return false;
  const date = new Date(event.start_time);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  if (filter === 'today') return date.toDateString() === now.toDateString();
  const end = new Date(now);
  if (filter === 'week') {
    end.setDate(now.getDate() + 7);
    return date >= now && date <= end;
  }
  if (filter === 'month') {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }
  return date > new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
}

export function EventsBrowser({ events }: { events: EventWithUniversity[] }) {
  const [query, setQuery] = useState('');
  const [university, setUniversity] = useState('all');
  const [dateFilter, setDateFilter] = useState<(typeof DATE_FILTERS)[number]['value']>('all');
  const [format, setFormat] = useState<'all' | 'in-person' | 'online'>('all');
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]['value']>('soonest');
  const [showFilters, setShowFilters] = useState(false);

  const universities = useMemo(() => Array.from(new Map(events.filter((event) => event.university).map((event) => [event.university!.id, event.university!])).values()).sort((a, b) => a.name.localeCompare(b.name)), [events]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return events
      .filter((event) => {
        const searchable = [event.title, event.description, event.location, event.university?.name, event.university?.short_name].filter(Boolean).join(' ').toLocaleLowerCase();
        return (!needle || searchable.includes(needle))
          && (university === 'all' || event.university?.id === university)
          && matchesDate(event, dateFilter)
          && (format === 'all' || (format === 'online' ? event.is_virtual : !event.is_virtual));
      })
      .sort((left, right) => {
        if (sort === 'name') return left.title.localeCompare(right.title);
        if (sort === 'latest') return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
        const leftTime = left.start_time ? new Date(left.start_time).getTime() : Number.POSITIVE_INFINITY;
        const rightTime = right.start_time ? new Date(right.start_time).getTime() : Number.POSITIVE_INFINITY;
        return leftTime - rightTime;
      });
  }, [dateFilter, events, format, query, sort, university]);

  const activeFilters = [university !== 'all', dateFilter !== 'all', format !== 'all', Boolean(query.trim())].filter(Boolean).length;
  const clearFilters = () => { setQuery(''); setUniversity('all'); setDateFilter('all'); setFormat('all'); setSort('soonest'); };

  return (
    <section aria-label="Campus events">
      <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block min-w-0 flex-1"><span className="sr-only">Search events</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events, campuses, places…" className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none ring-offset-background focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
          <button type="button" onClick={() => setShowFilters((value) => !value)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-input px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary lg:w-auto"><SlidersHorizontal className="mr-2 h-4 w-4" /> Filters {activeFilters > 0 && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{activeFilters}</span>}</button>
        </div>
        <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Event dates">
          {DATE_FILTERS.map((item) => <button key={item.value} type="button" role="tab" onClick={() => setDateFilter(item.value)} aria-selected={dateFilter === item.value} className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition ${dateFilter === item.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary'}`}>{item.label}</button>)}
        </div>
        {showFilters && <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <label className="text-xs font-semibold text-muted-foreground">University<select value={university} onChange={(event) => setUniversity(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus:border-primary"><option value="all">All universities</option>{universities.map((item) => <option key={item.id} value={item.id}>{item.short_name || item.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-muted-foreground">Format<select value={format} onChange={(event) => setFormat(event.target.value as typeof format)} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus:border-primary"><option value="all">In-person & online</option><option value="in-person">In-person only</option><option value="online">Online only</option></select></label>
          <label className="text-xs font-semibold text-muted-foreground">Sort by<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus:border-primary">{SORT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>}
        {activeFilters > 0 && <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{filtered.length} matching event{filtered.length === 1 ? '' : 's'}</span><button type="button" onClick={clearFilters} className="inline-flex items-center font-semibold text-primary hover:underline"><X className="mr-1 h-3 w-3" /> Clear filters</button></div>}
      </div>

      {filtered.length === 0 ? <EmptyState icon={Calendar} title={events.length === 0 ? 'No events right now' : 'No matching events'} description={events.length === 0 ? 'New events are added regularly. Check back soon to see what is happening on campus.' : 'Try another search, date, university, or event format.'} action={events.length > 0 ? <button type="button" onClick={clearFilters} className="rounded-lg border border-input px-4 py-2 text-sm font-semibold">Show all events</button> : undefined} /> : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((event) => <Link key={event.id} href={`/events/${event.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md"><div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-accent/15 via-primary/5 to-secondary/10">{event.cover_image_url ? <img src={event.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Calendar className="h-12 w-12 text-primary/30" />}{event.university && <Badge variant="secondary" className="absolute right-3 top-3">{event.university.short_name}</Badge>}</div><div className="flex flex-1 flex-col p-5"><h2 className="font-display font-semibold text-foreground transition-colors group-hover:text-primary">{event.title}</h2>{event.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{event.description}</p>}<div className="mt-auto space-y-2 pt-4 text-sm text-muted-foreground"><div className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0 text-primary" />{formatDate(event.start_time)}{event.start_time && ` · ${formatTime(event.start_time)}`}</div>{event.location && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{event.location}</span></div>}<div className="flex items-center gap-2"><Building2 className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{event.is_virtual ? 'Online event' : event.university ? `Organized by ${event.university.name}` : 'Campus event'}</span></div></div><div className="mt-3 flex items-center text-sm font-medium text-primary transition-all group-hover:gap-2">View details<ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" /></div></div></Link>)}</div>}
    </section>
  );
}
