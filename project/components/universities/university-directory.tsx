'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Check, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getLocalUniversityBranding } from '@/lib/data/university-branding';
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
  const types = useMemo(() => Array.from(new Set(universities.map((university) => university.institution_type).filter((value): value is string => Boolean(value)))).sort(), [universities]);
  const regions = useMemo(() => Array.from(new Set(universities.map((university) => university.region).filter((value): value is string => Boolean(value)))).sort(), [universities]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return universities.filter((university) => {
      const searchable = [university.name, university.official_name, university.short_name, university.abbreviation, university.slug, university.city, university.region, ...university.university_aliases.map((item) => item.alias)].filter(Boolean).join(' ').toLocaleLowerCase();
      return (type === allTypes || university.institution_type === type)
        && (region === 'All regions' || university.region === region)
        && (ownership === 'All ownership' || university.ownership_type === ownership)
        && (status === 'All campus status' || statusLabel(university.campus_launch_status) === status)
        && (branding === 'All branding' || (branding === 'branded' ? Boolean(university.logo_url || university.hero_image_url || university.landmark_image_url) : !university.logo_url && !university.hero_image_url && !university.landmark_image_url))
        && (!verifiedOnly || university.is_verified)
        && (!needle || searchable.includes(needle));
    });
  }, [branding, ownership, query, region, status, type, universities, verifiedOnly]);

  const activeFilters = [type !== allTypes, region !== 'All regions', ownership !== 'All ownership', status !== 'All campus status', branding !== 'All branding', verifiedOnly].filter(Boolean).length;
  const clearFilters = () => { setType(allTypes); setRegion('All regions'); setOwnership('All ownership'); setStatus('All campus status'); setBranding('All branding'); setVerifiedOnly(false); };

  return (
    <section aria-label="University directory">
      <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <label className="relative block"><span className="sr-only">Search universities</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search name, abbreviation, city, region, or alias" /></label>
        <div className="mt-3 flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{filtered.length} institution{filtered.length === 1 ? '' : 's'} found</p><button type="button" onClick={() => setShowFilters((value) => !value)} className="inline-flex min-h-10 items-center rounded-lg border border-input px-3 text-sm font-semibold hover:border-primary hover:text-primary"><SlidersHorizontal className="mr-2 h-4 w-4" /> Filters {activeFilters > 0 && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{activeFilters}</span>}</button></div>
        <div className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="University status filters">
          {['All campus status', 'Active', 'Onboarding', 'Planned'].map((item) => <button key={item} type="button" role="tab" onClick={() => setStatus(item)} aria-selected={status === item} className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition ${status === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary'}`}>{item}</button>)}
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
        {filtered.map((university) => { const localBranding = getLocalUniversityBranding(university.slug); const landmarkImage = university.landmark_image_url || university.hero_image_url; const logoUrl = university.logo_url; return <Link key={university.id} href={`/university/${university.slug}`} className="group overflow-hidden rounded-xl border bg-card transition hover:border-primary/40 hover:shadow-sm">
          <UniversityMedia src={landmarkImage} fallbackSrc={localBranding.campusUrl} alt={university.hero_alt_text || `${university.name} campus landmark`} name={university.name} shortName={university.short_name} kind="campus" className="h-32 w-full object-cover" />
            <div className="p-4">
            <div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 text-xs font-bold text-primary shadow-sm"><UniversityLogo src={logoUrl} fallbackSrc={localBranding.logoUrl} alt={university.logo_alt_text || `Official logo of ${university.name}`} name={university.name} shortName={university.short_name} className="object-contain" /></div><div><h2 className="font-semibold group-hover:text-primary">{university.short_name}</h2><p className="text-sm text-muted-foreground line-clamp-2">{university.official_name}</p></div></div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-primary/10 px-2 py-1 text-primary">{university.institution_type || 'Tertiary institution'}</span><span className="rounded-full bg-success/10 px-2 py-1 text-success">{statusLabel(university.campus_launch_status)}</span></div>
            <p className="mt-3 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{[university.city, university.region].filter(Boolean).join(', ') || 'Ghana'}</p>
          </div>
        </Link>; })}</div>
      {filtered.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No recognised institution matches that search.</p>}
    </section>
  );
}
