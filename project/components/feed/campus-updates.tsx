'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, CalendarDays, ChevronDown, CircleAlert, ExternalLink, Image as ImageIcon, Loader2, Newspaper, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

type FeedItem = {
  id: string;
  source_id: string;
  source_label: string;
  university_name: string;
  title: string;
  excerpt: string;
  canonical_url: string;
  published_at: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  category: string;
};

const pageSize = 18;
const categories = [
  ['all', 'For you'], ['news', 'News'], ['events', 'Events'], ['opportunities', 'Opportunities'],
  ['research', 'Research'], ['notices', 'Notices'], ['campus_life', 'Campus life'],
] as const;
const campuses = [
  ['all', 'All campuses'], ['university-of-ghana', 'University of Ghana'], ['knust', 'KNUST'],
  ['accra-technical-university', 'Accra Technical University'], ['academic-city', 'Academic City'],
] as const;

function formatDate(value: string | null) {
  if (!value) return 'Recently posted';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently posted' : new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(date);
}

export function CampusUpdates() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [campus, setCampus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const offset = useRef(0);

  const load = useCallback(async (append = false) => {
    const from = append ? offset.current : 0;
    if (append) setLoadingMore(true); else setLoading(true);
    setError(false);
    try {
      const supabase = createClient();
      let query = supabase.from('campus_feed_public_items')
        .select('id,source_id,source_label,university_name,title,excerpt,canonical_url,published_at,media_url,media_type,category')
        .order('published_at', { ascending: false, nullsFirst: false })
        // Keep tie-breaking on a column exposed by the public-only view.
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);
      if (category !== 'all') query = query.eq('category', category);
      if (campus !== 'all') query = query.eq('source_id', campus);
      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      const page = (data || []) as FeedItem[];
      setItems((current) => append ? [...current, ...page] : page);
      offset.current = append ? from + page.length : page.length;
      setHasMore(page.length === pageSize);
    } catch {
      setError(true);
      if (!append) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [category, campus]);

  useEffect(() => { void load(false); }, [load]); // search is intentionally local and does not refetch.

  const visible = items.filter((item) => !search.trim() || `${item.title} ${item.excerpt} ${item.university_name}`.toLowerCase().includes(search.trim().toLowerCase()));

  return <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <section className="min-w-0" aria-label="University updates">
      <div className="sticky top-[4.1rem] z-20 mb-4 rounded-2xl border border-border/80 bg-background/95 p-3 shadow-sm backdrop-blur sm:static sm:p-4">
        <label className="sr-only" htmlFor="campus-feed-search">Search campus updates</label>
        <input id="campus-feed-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search news, events and opportunities" className="h-11 w-full rounded-xl border border-border bg-muted/35 px-3.5 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10" />
        <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Update categories">
          {categories.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={category === value} onClick={() => setCategory(value)} className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors ${category === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}>{label}</button>)}
        </div>
      </div>

      {error && <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><div className="min-w-0 flex-1"><p className="font-semibold">Campus updates are temporarily unavailable.</p><p className="mt-1 text-muted-foreground">Your account is safe. Please retry in a moment.</p></div><Button variant="outline" size="sm" onClick={() => void load(false)}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></div>}

      {loading ? <div className="flex min-h-64 items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading campus updates…</div>
        : visible.length === 0 ? <div className="rounded-2xl border border-dashed bg-card px-5 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Newspaper className="h-6 w-6" /></div><h2 className="mt-4 text-lg font-semibold">{items.length ? 'No matching updates' : 'The campus feed is getting ready'}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{items.length ? 'Try another search or choose a different filter.' : 'Official university updates will appear here after they are reviewed. Check back soon.'}</p>{items.length > 0 && search && <Button className="mt-4" variant="outline" onClick={() => setSearch('')}>Clear search</Button>}</div>
        : <div className="space-y-4">{visible.map((item) => <article key={item.id} className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_12px_rgba(15,23,42,0.035)] transition-shadow hover:shadow-md">
          {item.media_url && item.media_type === 'image' && <a href={item.canonical_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="relative block aspect-[16/9] overflow-hidden bg-muted" aria-label={`Open ${item.title} at the source`}><Image src={item.media_url} alt="" fill sizes="(max-width: 1024px) 100vw, 720px" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="object-cover transition-transform duration-500 hover:scale-[1.02]" /></a>}
          {item.media_url && item.media_type === 'video' && <div className="relative bg-black"><video controls playsInline preload="none" className="max-h-[min(65vh,32rem)] w-full" aria-label={item.title}><source src={item.media_url} /></video><p className="bg-muted/60 px-3 py-2 text-xs text-muted-foreground">Video hosted by {item.source_label}; playback is user-controlled.</p></div>}
          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><span className="font-bold uppercase tracking-wide text-primary">{item.source_label}</span><span aria-hidden="true">·</span><span>{formatDate(item.published_at)}</span><span className="ml-auto rounded-full bg-muted px-2.5 py-1 font-medium capitalize">{item.category.replace('_', ' ')}</span></div>
            <h2 className="mt-3 text-lg font-bold leading-snug tracking-tight sm:text-xl">{item.title}</h2>
            {item.excerpt && <p className="mt-2 line-clamp-4 text-sm leading-6 text-muted-foreground">{item.excerpt}</p>}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-3"><span className="min-w-0 truncate text-xs text-muted-foreground">{item.university_name}</span><a href={item.canonical_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary transition hover:bg-primary/8">Read at source <ExternalLink className="h-4 w-4" /></a></div>
          </div>
        </article>)}
        {hasMore && <div className="flex justify-center py-2"><Button variant="outline" className="min-h-11 rounded-xl px-5" disabled={loadingMore} onClick={() => void load(true)}>{loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronDown className="mr-2 h-4 w-4" />}Load more</Button></div>}
        </div>}
    </section>

    <aside className="space-y-4 lg:sticky lg:top-24">
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-background to-amber-50/60 p-4 sm:p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><CalendarDays className="h-5 w-5" /></div><h2 className="mt-3 font-bold">Choose your campus</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">See updates from the institutions you care about.</p><label htmlFor="campus-feed-campus" className="sr-only">Filter by university</label><select id="campus-feed-campus" value={campus} onChange={(event) => setCampus(event.target.value)} className="mt-4 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10">{campuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="rounded-2xl border bg-card p-4 sm:p-5"><div className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /><h2 className="font-semibold">Official and attributed</h2></div><p className="mt-2 text-sm leading-6 text-muted-foreground">Updates come from official university feeds. Media stays with its publisher, and each post links to the original source.</p><p className="mt-3 text-xs leading-5 text-muted-foreground">Content is checked by UniEco Ghana before it appears here. For the latest details, follow the source link.</p></div>
      <Link href="/universities" className="flex min-h-12 items-center justify-between rounded-xl border bg-card px-4 text-sm font-semibold transition hover:border-primary/30 hover:text-primary"><span>Browse universities</span><ArrowUpRight className="h-4 w-4" /></Link>
    </aside>
  </div>;
}
