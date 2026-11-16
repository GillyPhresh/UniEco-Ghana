'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowDown, ArrowUpRight, GraduationCap, MapPin, Search, X } from 'lucide-react';
import { CampusPhotoGallery, UniversityLogo } from '@/components/universities/university-media';
import type { DirectoryCampus } from '@/lib/data/campus-presentation';
import { campusGroups, campusSearchText, type CampusGroup } from '@/lib/utils/campuses';

const pageSize = 24;

export function UniversityDirectory({ universities }: { universities: DirectoryCampus[] }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<CampusGroup>('all');
  const [region, setRegion] = useState('');
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const deferredQuery = useDeferredValue(query);
  const regions = useMemo(() => Array.from(new Set(universities.flatMap((school) => school.region || []))).sort(), [universities]);
  const presentGroups = useMemo(() => new Set(universities.map((school) => school.group)), [universities]);
  const matches = useMemo(() => {
    const terms = campusSearchText(deferredQuery).split(' ').filter(Boolean);
    return universities.filter((school) => (
      (group === 'all' || school.group === group)
      && (!region || school.region === region)
      && terms.every((term) => school.search.includes(term))
    ));
  }, [deferredQuery, group, region, universities]);

  const filtered = Boolean(query || group !== 'all' || region);
  function clearFilters() {
    setQuery('');
    setGroup('all');
    setRegion('');
    setVisibleCount(pageSize);
  }

  return (
    <section aria-label="Ghana tertiary institution directory">
      <div className="rounded-3xl border border-border bg-card p-3 shadow-sm sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_15rem]">
          <label className="relative block">
            <span className="sr-only">Search tertiary institutions</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setVisibleCount(pageSize); }}
              placeholder="School name, abbreviation, or town"
              className="h-12 w-full min-w-0 rounded-xl border border-border bg-background pl-11 pr-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            />
          </label>
          <label>
            <span className="sr-only">Filter by region</span>
            <select
              value={region}
              onChange={(event) => { setRegion(event.target.value); setVisibleCount(pageSize); }}
              className="h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">All regions</option>
              {regions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Institution type">
          {campusGroups.filter((item) => item.id === 'all' || presentGroups.has(item.id)).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={group === item.id}
              onClick={() => { setGroup(item.id); setVisibleCount(pageSize); }}
              className={`min-h-11 rounded-full border px-3.5 text-xs font-semibold transition-colors sm:text-sm ${group === item.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:border-primary/60'}`}
            >{item.label}</button>
          ))}
        </div>
      </div>

      <div className="mb-3 mt-5 flex min-h-11 items-center justify-between gap-3 sm:mt-7">
        <p className="text-sm text-muted-foreground" role="status">
          <span className="font-semibold text-foreground">{matches.length}</span> {matches.length === 1 ? 'institution' : 'institutions'}
          {filtered && ` found of ${universities.length}`}
        </p>
        {filtered && <button type="button" onClick={clearFilters} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:underline"><X className="h-4 w-4" aria-hidden="true" /> Clear filters</button>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-5">
        {matches.slice(0, visibleCount).map((campus, index) => <CampusCard key={campus.id} campus={campus} priority={index < 2} />)}
      </div>
      {!matches.length && (
        <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center sm:p-12">
          <GraduationCap className="mx-auto mb-3 h-7 w-7 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">No institutions match</h2>
          <p className="mt-1 text-sm text-muted-foreground">Try a shorter school name, a town, or a different region.</p>
        </div>
      )}
      {visibleCount < matches.length && (
        <div className="mt-7 flex flex-col items-center gap-2">
          <button type="button" onClick={() => setVisibleCount((current) => current + pageSize)} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-semibold transition hover:border-primary/60">
            Show {Math.min(pageSize, matches.length - visibleCount)} more <ArrowDown className="h-4 w-4 text-primary" aria-hidden="true" />
          </button>
          <p className="text-xs text-muted-foreground">Showing {visibleCount} of {matches.length}</p>
        </div>
      )}
    </section>
  );
}

function CampusCard({ campus, priority }: { campus: DirectoryCampus; priority: boolean }) {
  const href = `/university/${campus.slug}`;
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-colors hover:border-primary/50 focus-within:border-primary">
      <CampusPhotoGallery photos={campus.photos} name={campus.name} shortName={campus.shortName} href={href} variant="card" priority={priority} />
      <Link href={href} prefetch={false} className="flex flex-1 flex-col p-4 outline-offset-[-3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:p-5" aria-label={`Explore ${campus.name}`}>
        <div className="flex items-start gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border/65 bg-white p-1.5 sm:h-16 sm:w-16">
            <UniversityLogo src={campus.logo} fallbackSrc={campus.fallbackLogo} alt="" name={campus.name} shortName={campus.shortName} />
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-semibold uppercase leading-snug tracking-wide text-primary">{campus.institutionType}</p>
            <h2 className="break-words font-display text-base font-bold leading-snug text-foreground sm:text-lg">{campus.name}</h2>
          </div>
        </div>
        <div className="mt-auto flex min-h-11 items-end justify-between gap-2 pt-3 text-sm">
          <span className="inline-flex items-start gap-1.5 text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{campus.location || 'Ghana'}</span>
          <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary">View profile <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
        </div>
      </Link>
    </article>
  );
}
