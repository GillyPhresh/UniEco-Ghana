'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, CalendarDays, ChevronDown, CircleAlert, ExternalLink, Image as ImageIcon, Loader2, Newspaper, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { CampusUpdateActions } from '@/components/feed/campus-update-actions';
import { CampusUpdateMedia } from '@/components/feed/campus-update-media';
import { schoolSourceId } from '@/lib/ai/research-catalog';
import { publicSourceUrl } from '@/lib/ai/public-source-url';
import { updateDate, updateSummary } from '@/lib/ai/update-copy';

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
type FeedSource = { source_id: string; source_label: string; university_name: string; source_kind: 'campus' | 'opportunities' };
type CampusOption = { value: string; label: string };

const pageSize = 18;
const categories = [
  ['all', 'For you'], ['news', 'News'], ['events', 'Events'], ['opportunities', 'Opportunities'],
  ['research', 'Research'], ['notices', 'Notices'], ['campus_life', 'Campus life'],
] as const;
export function CampusUpdates() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [sources, setSources] = useState<FeedSource[]>([]);
  const [campuses, setCampuses] = useState<CampusOption[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [campus, setCampus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const offset = useRef(0);
  const newestRequest = useRef(0);

  const load = useCallback(async (append = false) => {
    const requestId = ++newestRequest.current;
    const from = append ? offset.current : 0;
    if (append) setLoadingMore(true); else setLoading(true);
    setError(false);
    if (!append && campus.startsWith('no-feed:')) {
      setItems([]);
      offset.current = 0;
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
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
      if (requestId !== newestRequest.current) return;
      if (queryError) throw queryError;
      const page = (data || []) as FeedItem[];
      setItems((current) => append ? [...current, ...page] : page);
      offset.current = append ? from + page.length : page.length;
      setHasMore(page.length === pageSize);
    } catch {
      if (requestId !== newestRequest.current) return;
      setError(true);
      if (!append) setItems([]);
    } finally {
      if (requestId === newestRequest.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [category, campus]);

  const invalidateRead = useCallback(() => { newestRequest.current++; }, []);
  useEffect(() => { void load(false); return invalidateRead; }, [load, invalidateRead]); // search is intentionally local and does not refetch.
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void Promise.all([
      supabase.from('campus_feed_public_sources').select('source_id,source_label,university_name,source_kind').order('source_label'),
      supabase.from('universities').select('id,name,official_name,short_name,slug').eq('is_enabled', true).order('name').limit(500),
    ]).then(([sourceResult, universityResult]) => {
      if (!active) return;
      const sourceRows = (sourceResult.data || []) as FeedSource[];
      setSources(sourceRows);
      const normalizeName = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
      const campusSources = sourceRows.filter((source) => source.source_kind === 'campus');
      const options = ((universityResult.data || []) as Array<{ id: string; name: string; official_name: string | null; short_name: string | null; slug: string }>).map((university) => {
        const aliases = [university.name, university.official_name, university.short_name].filter((value): value is string => Boolean(value)).map(normalizeName);
        const namedSources = campusSources.filter((candidate) => aliases.includes(normalizeName(candidate.university_name)));
        const source = campusSources.find((candidate) => candidate.source_id === schoolSourceId(university.id))
          || (namedSources.length === 1 ? namedSources[0] : undefined);
        return {
          value: source?.source_id || `no-feed:${university.slug}`,
          label: `${university.short_name || university.name}${source ? '' : ' · updates not configured yet'}`,
        };
      });
      setCampuses(options);
    });
    return () => { active = false; };
  }, []);

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
        : visible.length === 0 ? <div className="rounded-2xl border border-dashed bg-card px-5 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Newspaper className="h-6 w-6" /></div><h2 className="mt-4 text-lg font-semibold">{items.length ? 'No matching updates' : campus.startsWith('no-feed:') ? 'School updates are being set up' : campus !== 'all' ? 'No reviewed updates yet' : 'The campus feed is getting ready'}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{items.length ? 'Try another search or choose a different filter.' : campus.startsWith('no-feed:') ? 'This school is in the UniEco directory, but its verified official news source is not configured yet. We only publish updates that can be checked against an original source.' : campus !== 'all' ? 'No source-linked updates for this school have passed review yet. Check back soon.' : 'Source-linked university updates appear here after review. Check back soon.'}</p>{items.length > 0 && search && <Button className="mt-4" variant="outline" onClick={() => setSearch('')}>Clear search</Button>}</div>
        : <div className="space-y-4">{visible.map((item) => <article key={item.id} className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_2px_12px_rgba(15,23,42,0.035)] transition-shadow hover:shadow-md">
          <div className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] p-2.5"><div className="flex min-w-0 items-center gap-2.5"><Image src="/unieco-main-logo.png" alt="UniEco Ghana" width={42} height={42} className="h-9 w-9 shrink-0 object-contain" /><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{item.category === 'opportunities' ? 'Student opportunity' : 'Campus update'}</p><p className="truncate text-xs text-muted-foreground">Source-linked • {item.source_label}</p></div></div><span className="shrink-0 text-[11px] text-muted-foreground">{updateDate(item.published_at)}</span></div>
            <div className="flex justify-end"><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">{item.category.replace('_', ' ')}</span></div>
            <h2 className="mt-3 text-lg font-bold leading-snug tracking-tight sm:text-xl">{item.title}</h2>
            {updateSummary(item.excerpt, item.title) && <p className="mt-2 line-clamp-4 text-sm leading-6 text-muted-foreground">{updateSummary(item.excerpt, item.title)}</p>}
            <div className="mt-3 empty:hidden"><CampusUpdateMedia url={item.media_url} kind={item.media_type} publisher={item.source_label} sourceUrl={item.canonical_url} /></div>
            <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between"><span className="min-w-0 truncate text-xs text-muted-foreground">{item.university_name}</span><div className="flex flex-wrap items-center gap-2"><CampusUpdateActions id={item.id} title={item.title} excerpt={updateSummary(item.excerpt, item.title)} sourceLabel={item.source_label} universityName={item.university_name} />{publicSourceUrl(item.canonical_url) && <a href={publicSourceUrl(item.canonical_url)?.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary transition hover:bg-primary/8">Read source <ExternalLink className="h-4 w-4" /></a>}</div></div>
          </div>
        </article>)}
        {hasMore && <div className="flex justify-center py-2"><Button variant="outline" className="min-h-11 rounded-xl px-5" disabled={loadingMore} onClick={() => void load(true)}>{loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronDown className="mr-2 h-4 w-4" />}Load more</Button></div>}
        </div>}
    </section>

    <aside className="space-y-4 lg:sticky lg:top-24">
      <Link href={campus !== 'all' && !campus.startsWith('no-feed:') ? '/updates/bulletin?source=' + encodeURIComponent(campus) : '/updates/bulletin'} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 text-sm font-semibold transition hover:border-primary/50"><span>Open campus briefing</span><ArrowUpRight className="h-4 w-4" /></Link>
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-background to-amber-50/60 p-4 sm:p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><CalendarDays className="h-5 w-5" /></div><h2 className="mt-3 font-bold">Choose a campus or source</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">Browse updates from any of UniEco’s 207 schools, or national student-opportunity providers.</p><label htmlFor="campus-feed-campus" className="sr-only">Filter by university or source</label><select id="campus-feed-campus" value={campus} onChange={(event) => setCampus(event.target.value)} className="mt-4 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"><option value="all">All campuses and opportunities</option><optgroup label={`Universities (${campuses.length})`}>{campuses.map((school) => <option key={school.value} value={school.value}>{school.label}</option>)}</optgroup>{sources.filter((source) => source.source_kind === 'opportunities').map((source) => <option key={source.source_id} value={source.source_id}>{`National opportunity · ${source.source_label}`}</option>)}</select></div>
      <div className="rounded-2xl border bg-card p-4 sm:p-5"><div className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /><h2 className="font-semibold">Source-led, reviewed updates</h2></div><p className="mt-2 text-sm leading-6 text-muted-foreground">Each post names its publisher and links to the original page. UniEco’s branded share card is a summary design, not a substitute for the source.</p><p className="mt-3 text-xs leading-5 text-muted-foreground">Opportunity leads can change or close. Confirm eligibility, deadlines, and any fees directly with the named provider before applying.</p></div>
      <Link href="/universities" className="flex min-h-12 items-center justify-between rounded-xl border bg-card px-4 text-sm font-semibold transition hover:border-primary/30 hover:text-primary"><span>Browse universities</span><ArrowUpRight className="h-4 w-4" /></Link>
    </aside>
  </div>;
}
