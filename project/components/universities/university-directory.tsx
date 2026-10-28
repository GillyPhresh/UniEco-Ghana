'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import { Check, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getLocalUniversityBranding, getUniversityLogoObjectPosition } from '@/lib/data/university-branding';
import { UniversityLogo, UniversityMedia } from '@/components/universities/university-media';

type DirectoryUniversity = {
  id: string; name: string; official_name: string; short_name: string; abbreviation: string | null; slug: string;
  city: string | null; region: string | null; logo_url: string | null; hero_image_url: string | null; landmark_image_url: string | null;
  logo_alt_text: string | null; hero_alt_text: string | null; institution_type: string | null;
  ownership_type: string | null; campus_launch_status: string; is_verified: boolean;
  university_aliases: Array<{ alias: string }>;
};

const allTypes = 'All institution types';

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function UniversityDirectory({ universities }: { universities: DirectoryUniversity[] }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState(allTypes);
  const [region, setRegion] = useState('All regions');
  const [ownership, setOwnership] = useState('All ownership');
  const [status, setStatus] = useState('All campus status');
  const [branding, setBranding] = useState('All branding');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const types = useMemo(() => Array.from(new Set(universities.map((university) => university.institution_type).filter((value): value is string => Boolean(value)))).sort(), [universities]);
  const regions = useMemo(() => Array.from(new Set(universities.map((university) => university.region).filter((value): value is string => Boolean(value)))).sort(), [universities]);
  const statusCounts = useMemo(() => universities.reduce<Record<string, number>>((counts, university) => {
    const label = statusLabel(university.campus_launch_status);
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {}), [universities]);
  const brandingStats = useMemo(() => universities.reduce((stats, university) => {
    const localBranding = getLocalUniversityBranding(university.slug);
    const hasLogo = Boolean(localBranding.logoUrl || university.logo_url);
    const hasCampus = Boolean(university.hero_image_url || university.landmark_image_url || localBranding.campusUrl);
    return { complete: stats.complete + Number(hasLogo && hasCampus), partial: stats.partial + Number(hasLogo !== hasCampus), pending: stats.pending + Number(!hasLogo && !hasCampus) };
  }, { complete: 0, partial: 0, pending: 0 }), [universities]);
  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase();
    return universities.filter((university) => {
      const localBranding = getLocalUniversityBranding(university.slug);
      const hasBranding = Boolean(localBranding.logoUrl || university.logo_url || university.hero_image_url || university.landmark_image_url || localBranding.campusUrl);
      const searchable = [university.name, university.official_name, university.short_name, university.abbreviation, university.slug, university.city, university.region, ...university.university_aliases.map((item) => item.alias)].filter(Boolean).join(' ').toLocaleLowerCase();
      return (type === allTypes || university.institution_type === type)
        && (region === 'All regions' || university.region === region)
        && (ownership === 'All ownership' || university.ownership_type === ownership)
        && (status === 'All campus status' || statusLabel(university.campus_launch_status) === status)
        && (branding === 'All branding' || (branding === 'branded' ? hasBranding : !hasBranding))
        && (!verifiedOnly || university.is_verified)
        && (!needle || searchable.includes(needle));
    });
  }, [branding, deferredQuery, ownership, region, status, type, universities, verifiedOnly]);

  const activeFilters = [type !== allTypes, region !== 'All regions', ownership !== 'All ownership', status !== 'All campus status', branding !== 'All branding', verifiedOnly].filter(Boolean).length;
  const clearFilters = () => { setType(allTypes); setRegion('All regions'); setOwnership('All ownership'); setStatus('All campus status'); setBranding('All branding'); setVerifiedOnly(false); };

  return (
    <section aria-label="University directory">
      <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <label className="relative block"><span className="sr-only">Search universities</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search name, abbreviation, city, region, or alias" /></label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{filtered.length}</span> of {universities.length} institution{universities.length === 1 ? '' : 's'} shown</p><button type="button" onClick={() => setShowFilters((value) => !value)} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-input px-3 text-sm font-semibold hover:border-primary hover:text-primary"><SlidersHorizontal className="mr-2 h-4 w-4" /> Filters {activeFilters > 0 && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{activeFilters}</span>}</button></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] sm:max-w-xl sm:grid-cols-3 sm:text-xs">
          <div className="rounded-xl border border-primary/15 bg-primary/5 px-2 py-2"><p className="font-bold text-primary">{brandingStats.complete}</p><p className="text-muted-foreground">Full profiles</p></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-2 py-2"><p className="font-bold text-amber-700">{brandingStats.partial}</p><p className="text-muted-foreground">Logo or photo</p></div>
          <div className="rounded-xl border border-border bg-muted/40 px-2 py-2"><p className="font-bold text-foreground">{brandingStats.pending}</p><p className="text-muted-foreground">Profile setup</p></div>
        </div>
        <div className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="University status filters">
          {['All campus status', 'Active', 'Onboarding', 'Planned'].map((item) => { const count = item === 'All campus status' ? universities.length : statusCounts[item] || 0; return <button key={item} type="button" role="tab" onClick={() => setStatus(item)} aria-selected={status === item} className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition ${status === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary'}`}>{item === 'All campus status' ? 'All institutions' : item} <span className="ml-1 opacity-75">{count}</span></button>; })}
        </div>
        {showFilters && <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-muted-foreground">Institution type<select className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground" value={type} onChange={(event) => setType(event.target.value)}><option>{allTypes}</option>{types.map((item) => <option key={item!}>{item}</option>)}</select></label>
          <label className="text-xs font-semibold text-muted-foreground">Region<select className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground" value={region} onChange={(event) => setRegion(event.target.value)}><option>All regions</option>{regions.map((item) => <option key={item!}>{item}</option>)}</select></label>
          <label className="text-xs font-semibold text-muted-foreground">Ownership<select className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground" value={ownership} onChange={(event) => setOwnership(event.target.value)}><option>All ownership</option><option value="public">Public</option><option value="private">Private</option><option value="other">Other</option></select></label>
          <label className="text-xs font-semibold text-muted-foreground">Branding<select className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground" value={branding} onChange={(event) => setBranding(event.target.value)}><option value="All branding">All branding</option><option value="branded">Logo or campus photo</option><option value="unbranded">Needs branding</option></select></label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-sm font-semibold text-foreground sm:col-span-2 lg:col-span-4"><input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} className="h-4 w-4 accent-primary" /><Check className="h-4 w-4 text-primary" /> Verified institutions only</label>
        </div>}
        {activeFilters > 0 && <button type="button" onClick={clearFilters} className="mt-3 inline-flex items-center text-xs font-semibold text-primary hover:underline"><X className="mr-1 h-3 w-3" /> Clear filters</button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((university) => { const localBranding = getLocalUniversityBranding(university.slug); const landmarkImage = university.landmark_image_url || university.hero_image_url; const logoUrl = university.logo_url || localBranding.logoUrl; const hasOfficialBranding = Boolean(logoUrl || landmarkImage || localBranding.campusUrl); return <Link key={university.id} prefetch href={`/university/${university.slug}`} className="group touch-manipulation overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-[0.995]">
          <div className="relative"><UniversityMedia src={landmarkImage} fallbackSrc={localBranding.campusUrl} alt={university.hero_alt_text || `${university.name} campus landmark`} name={university.name} shortName={university.short_name} kind="campus" className="h-44 w-full object-cover sm:h-48" /><span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm backdrop-blur-sm ${hasOfficialBranding ? 'bg-white/90 text-primary' : 'bg-slate-950/70 text-white'}`}>{hasOfficialBranding ? 'Campus profile' : 'Profile being completed'}</span></div>
            <div className="p-4">
            <div className="flex gap-3"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-white p-1 text-xs font-bold text-primary shadow-sm sm:h-16 sm:w-16"><UniversityLogo src={logoUrl} fallbackSrc={localBranding.logoUrl} logoObjectPosition={getUniversityLogoObjectPosition(university.slug)} alt={university.logo_alt_text || `Official logo of ${university.name}`} name={university.name} shortName={university.short_name} /></div><div className="min-w-0"><h2 className="truncate font-semibold group-hover:text-primary">{university.short_name}</h2><p className="line-clamp-2 text-sm text-muted-foreground">{university.official_name}</p></div></div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-primary/10 px-2 py-1 text-primary">{university.institution_type || 'Tertiary institution'}</span><span className="rounded-full bg-success/10 px-2 py-1 text-success">{statusLabel(university.campus_launch_status)}</span></div>
            <p className="mt-3 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{[university.city, university.region].filter(Boolean).join(', ') || 'Ghana'}</p>
          </div>
        </Link>; })}</div>
      {filtered.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No recognised institution matches that search.</p>}
    </section>
  );
}
