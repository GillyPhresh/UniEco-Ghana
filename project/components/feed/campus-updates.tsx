'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Building2, ChevronDown, CircleAlert, ExternalLink, Loader2, Newspaper, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { CampusUpdateActions } from '@/components/feed/campus-update-actions';
import { CampusUpdatePhoto } from '@/components/feed/campus-update-photo';
import { ReaderRecommendations } from '@/components/feed/reader-recommendations';
import { schoolSourceId } from '@/lib/ai/research-catalog';
import { publicSourceUrl } from '@/lib/ai/public-source-url';
import { updateCategory, updateDate, updateSummary } from '@/lib/ai/update-copy';
import { newsroomFields, newsroomPageSize as pageSize, newsroomSearchTokens, type FeedItem } from '@/lib/ai/newsroom';

type FeedSource = { source_id: string; source_label: string; university_name: string; source_kind: 'campus' | 'opportunities' };
type CampusOption = { value: string; label: string };

const categories = [
  ['all', 'Top stories'], ['news', 'News'], ['events', 'Events'], ['opportunities', 'Opportunities'],
  ['research', 'Research'], ['notices', 'Notices'], ['campus_life', 'Campus life'],
] as const;
export function CampusUpdates({ initialItems }: { initialItems?: FeedItem[] }) {
  const [items, setItems] = useState<FeedItem[]>(initialItems || []);
  const [sources, setSources] = useState<FeedSource[]>([]);
  const [campuses, setCampuses] = useState<CampusOption[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [campus, setCampus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [querySearch, setQuerySearch] = useState('');
  const [loading, setLoading] = useState(initialItems === undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(initialItems?.length === pageSize);
  const offset = useRef(initialItems?.length || 0);
  const newestRequest = useRef(0);
  const serverSeeded = useRef(initialItems !== undefined);

  const load = useCallback(async (append = false, keepVisible = false) => {
    const requestId = ++newestRequest.current;
    const from = append ? offset.current : 0;
    if (append) setLoadingMore(true); else if (!keepVisible) setLoading(true);
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
        .select(newsroomFields)
        .order('published_at', { ascending: false, nullsFirst: false })
        // Keep tie-breaking on a column exposed by the public-only view.
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);
      if (category !== 'all') query = query.eq('category', category);
      if (campus !== 'all') query = query.eq('source_id', campus);
      for (const token of newsroomSearchTokens(querySearch)) {
        query = query.or(['title', 'excerpt', 'university_name', 'source_label'].map((column) => `${column}.ilike.*${token}*`).join(','));
      }
      const { data, error: queryError } = await query;
      if (requestId !== newestRequest.current) return;
      if (queryError) throw queryError;
      const page = (data || []) as FeedItem[];
      setItems((current) => append ? Array.from(new Map([...current, ...page].map((item) => [item.id, item])).values()) : page);
      offset.current = append ? from + page.length : page.length;
      setHasMore(page.length === pageSize);
    } catch {
      if (requestId !== newestRequest.current) return;
      setError(true);
      if (!append && !keepVisible) setItems([]);
    } finally {
      if (requestId === newestRequest.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [category, campus, querySearch]);

  const invalidateRead = useCallback(() => { newestRequest.current++; }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => setQuerySearch(search.trim()), 260);
    return () => window.clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    void load(false, serverSeeded.current);
    serverSeeded.current = false;
    return invalidateRead;
  }, [load, invalidateRead]);
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
          label: university.official_name || university.name,
        };
      });
      setCampuses(options);
    });
    return () => { active = false; };
  }, []);

  const frontPage = category === 'all' && campus === 'all' && !querySearch;
  const lead = frontPage ? items[0] : undefined;
  const headlines = lead ? items.slice(1, 5) : [];
  const latest = lead ? items.slice(5) : items;
  const selectedLabel = campuses.find((option) => option.value === campus)?.label
    || sources.find((source) => source.source_id === campus)?.source_label;
  const sectionLabel = categories.find(([value]) => value === category)?.[1] || 'Latest updates';
  const briefing = campus !== 'all' && !campus.startsWith('no-feed:') ? '/updates/bulletin?source=' + encodeURIComponent(campus) : '/updates/bulletin';

  return <>
    <header className="border-b border-border pb-3 pt-3 sm:pb-6 sm:pt-8">
      <div className="flex items-center justify-between gap-3">
        <p className="newsroom-kicker">UniEco Ghana <span aria-hidden="true">/</span> News desk</p>
        <Link href={briefing} className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 text-xs font-bold text-primary hover:underline sm:text-sm">Campus briefing <ArrowUpRight className="h-4 w-4" /></Link>
      </div>
      <h1 className="newsroom-headline text-[clamp(2rem,5.5vw,4.5rem)] leading-[1.08]">Campus Updates</h1>
      <p className="mt-2 max-w-xl text-sm leading-5 text-muted-foreground sm:mt-3 sm:text-base sm:leading-6">News, events and opportunities from Ghana’s tertiary institutions.</p>
    </header>
    <nav className="flex gap-5 overflow-x-auto border-b border-border [scrollbar-width:none] sm:gap-7" aria-label="News sections">
      {categories.map(([value, label]) => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}
        className={`newsroom-section min-h-[48px] shrink-0 border-b-[3px] px-0.5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 ${category === value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
    </nav>
    <form role="search" aria-label="Find campus stories" onSubmit={(event) => { event.preventDefault(); setQuerySearch(search.trim()); }} className="grid grid-cols-1 gap-2 border-b border-border py-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,17rem)]">
      <label className="relative block min-w-0">
        <span className="sr-only">Search campus updates</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input id="campus-feed-search" type="text" inputMode="search" enterKeyHint="search" value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} placeholder="Search headlines or a school" className="h-11 w-full rounded-md border border-border bg-background pl-9 pr-3 text-base outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <div className="relative min-w-0">
        <Building2 aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <label htmlFor="campus-feed-campus" className="sr-only">Filter by university or source</label>
        <select id="campus-feed-campus" value={campus} onChange={(event) => setCampus(event.target.value)} className="h-11 w-full appearance-none truncate rounded-md border border-border bg-background pl-9 pr-8 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring">
          <option value="all">All campuses</option>
          <optgroup label={`Tertiary institutions (${campuses.length})`}>{campuses.map((school) => <option key={school.value} value={school.value}>{school.label}</option>)}</optgroup>
          <optgroup label="National sources">{sources.filter((source) => source.source_kind === 'opportunities').map((source) => <option key={source.source_id} value={source.source_id}>{source.source_label}</option>)}</optgroup>
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
      </div>
    </form>
    {!campus.startsWith('no-feed:') && <ReaderRecommendations key={campus} source={campus === 'all' ? null : campus} sourceLabel={selectedLabel} />}
    {error && <div role="alert" className="my-4 flex flex-wrap items-center gap-3 border-l-4 border-destructive bg-muted px-4 py-3 text-sm">
      <CircleAlert className="h-5 w-5 shrink-0 text-destructive" /><p className="flex-1">{items.length ? 'Some updates could not be fetched.' : 'Updates could not load.'}</p>
      <Button variant="outline" size="sm" onClick={() => void load(false, Boolean(items.length))}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
    </div>}

    {loading ? <div role="status" className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 motion-safe:animate-spin" />Loading updates…</div>
      : !items.length ? (!error && <section className="my-5 border-t-2 border-foreground/80 py-8" aria-label="No matching updates">
        <Newspaper className="mb-3 h-6 w-6 text-primary" />
        <h2 className="newsroom-headline text-2xl">{querySearch ? 'No matching stories' : campus.startsWith('no-feed:') ? 'No publisher linked yet' : 'No stories in this section yet'}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedLabel ? selectedLabel + ' · ' : ''}{querySearch ? 'Try a different headline or school name.' : 'Choose another section or school to keep reading.'}</p>
        {(campus !== 'all' || category !== 'all' || search) && <button type="button" className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-bold text-primary hover:underline" onClick={() => { setCampus('all'); setCategory('all'); setSearch(''); setQuerySearch(''); }}><X className="h-4 w-4" />Clear filters</button>}
      </section>)
      : <div className="space-y-7 pt-5 sm:space-y-9 sm:pt-7">
        {lead && <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] lg:gap-8" aria-label="Top stories">
          <article className="min-w-0">
            <div className="newsroom-kicker mb-2">Lead story</div>
            <StoryMeta item={lead} />
            <h2 className="newsroom-headline mb-3 mt-2 text-[clamp(1.65rem,3.8vw,3rem)] leading-[1.12]"><Link href={'/updates/' + lead.id} className="hover:text-primary">{lead.title}</Link></h2>
            <LeadArtwork item={lead} />
            <div className="border-b border-border pb-4 pt-3">
              {updateSummary(lead.excerpt, lead.title) && <p className="line-clamp-3 text-sm leading-6 text-muted-foreground sm:text-base">{updateSummary(lead.excerpt, lead.title)}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-4">
                <Link href={'/updates/' + lead.id} className="inline-flex min-h-[44px] items-center gap-2 text-sm font-bold text-primary hover:underline">Read story <ArrowRight className="h-4 w-4" /></Link>
                <CampusUpdateActions key={lead.id} id={lead.id} title={lead.title} compact preload />
              </div>
            </div>
          </article>
          <section className="min-w-0 lg:border-l lg:border-border lg:pl-6" aria-labelledby="updates-newswire">
            <h2 id="updates-newswire" className="newsroom-headline border-t-2 border-foreground pb-1 pt-3 text-2xl">The Newswire</h2>
            {headlines.length ? <ol className="divide-y divide-border">{headlines.map((item) => <li key={item.id}><NewsHeadline item={item} /></li>)}</ol>
              : <p className="border-b py-3 text-sm text-muted-foreground">More campus headlines will appear here.</p>}
            <Link href={briefing} className="mt-2 inline-flex min-h-[44px] items-center gap-2 text-sm font-bold text-primary hover:underline">View the campus briefing <ArrowUpRight className="h-4 w-4" /></Link>
          </section>
        </section>}
        {latest.length > 0 && <section aria-labelledby="updates-latest">
          <div className="border-t-2 border-foreground pb-3 pt-3">
            <h2 id="updates-latest" className="newsroom-headline text-2xl sm:text-3xl">{querySearch ? 'Search results' : frontPage || category === 'all' ? 'Latest updates' : sectionLabel}</h2>
            {selectedLabel && <p className="mt-1 text-sm text-muted-foreground">{selectedLabel}</p>}
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">{latest.map((item) => <NewsHeadline key={item.id} item={item} summary />)}</div>
        </section>}
        {hasMore && <div className="flex justify-center"><Button variant="outline" className="h-11" disabled={loadingMore} onClick={() => void load(true)}>{loadingMore ? <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" /> : <ChevronDown className="mr-2 h-4 w-4" />}More headlines</Button></div>}
      </div>}
    <footer className="mt-8 flex flex-wrap items-start justify-between gap-3 border-t border-border pt-4 text-sm text-muted-foreground">
      <p className="max-w-xl">UniEco summarises attributed sources. Confirm eligibility, deadlines, and changes with the original publisher.</p>
      <Link href="/universities" className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline">Browse tertiary institutions <ArrowUpRight className="h-4 w-4" /></Link>
    </footer>
  </>;
}

function LeadArtwork({ item }: { item: FeedItem }) {
  return <Link href={'/updates/' + item.id} aria-label={'Read: ' + item.title} className="newsroom-lead-art relative isolate block overflow-hidden bg-muted">
    <CampusUpdatePhoto item={item} sizes="(max-width: 1023px) 100vw, 780px" priority />
  </Link>;
}

function StoryMeta({ item }: { item: FeedItem }) {
  return <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
    <span className="newsroom-kicker">{updateCategory(item.category)}</span><span aria-hidden="true">·</span>
    <span>{item.source_label}</span>
    {item.published_at && <><span aria-hidden="true">·</span><time dateTime={item.published_at}>{updateDate(item.published_at)}</time></>}
  </p>;
}

function NewsHeadline({ item, summary = false }: { item: FeedItem; summary?: boolean }) {
  const original = publicSourceUrl(item.canonical_url);
  const excerpt = summary && updateSummary(item.excerpt, item.title, 190);
  return <article className={`min-w-0 py-3.5 ${summary ? 'border-b border-border' : ''}`}>
    <StoryMeta item={item} />
    <h3 className="newsroom-headline mt-1 text-lg leading-tight sm:text-xl"><Link href={'/updates/' + item.id} className="hover:text-primary hover:underline">{item.title}</Link></h3>
    {excerpt && <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{excerpt}</p>}
    <div className="mt-1 flex flex-wrap items-center gap-x-2">
      {summary && original && <a href={original.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-primary hover:underline">Original source <ExternalLink className="h-3.5 w-3.5" /></a>}
      <CampusUpdateActions id={item.id} title={item.title} compact shareOnly />
    </div>
  </article>;
}
