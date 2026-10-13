'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Building2, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

type DirectoryUniversity = {
  id: string; name: string; official_name: string; short_name: string; abbreviation: string | null; slug: string;
  city: string | null; region: string | null; logo_url: string | null; hero_image_url: string | null;
  logo_alt_text: string | null; hero_alt_text: string | null; institution_type: string | null;
  ownership_type: string | null; campus_launch_status: string; is_verified: boolean;
  university_aliases: Array<{ alias: string }>;
};

const allTypes = 'All institution types';

export function UniversityDirectory({ universities }: { universities: DirectoryUniversity[] }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState(allTypes);
  const [region, setRegion] = useState('All regions');
  const types = useMemo(() => Array.from(new Set(universities.map((university) => university.institution_type).filter((value): value is string => Boolean(value)))).sort(), [universities]);
  const regions = useMemo(() => Array.from(new Set(universities.map((university) => university.region).filter((value): value is string => Boolean(value)))).sort(), [universities]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return universities.filter((university) => {
      const searchable = [university.name, university.official_name, university.short_name, university.abbreviation, university.slug, university.city, university.region, ...university.university_aliases.map((item) => item.alias)].filter(Boolean).join(' ').toLocaleLowerCase();
      return (type === allTypes || university.institution_type === type) && (region === 'All regions' || university.region === region) && (!needle || searchable.includes(needle));
    });
  }, [query, region, type, universities]);

  return (
    <section aria-label="University directory">
      <div className="mb-6 grid gap-3 md:grid-cols-[1fr_240px_200px]">
        <label className="relative block"><span className="sr-only">Search universities</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search name, abbreviation, city, region, or alias" /></label>
        <label><span className="sr-only">Institution type</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={type} onChange={(event) => setType(event.target.value)}><option>{allTypes}</option>{types.map((item) => <option key={item!}>{item}</option>)}</select></label>
        <label><span className="sr-only">Region</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={region} onChange={(event) => setRegion(event.target.value)}><option>All regions</option>{regions.map((item) => <option key={item!}>{item}</option>)}</select></label>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{filtered.length} institution{filtered.length === 1 ? '' : 's'} found</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((university) => <Link key={university.id} href={`/university/${university.slug}`} className="group overflow-hidden rounded-xl border bg-card transition hover:border-primary/40 hover:shadow-sm">
          {university.hero_image_url ? <img src={university.hero_image_url} alt={university.hero_alt_text || `${university.name} campus`} className="h-32 w-full object-cover" loading="lazy" /> : <div className="flex h-24 items-center justify-center bg-muted/40"><Building2 className="h-8 w-8 text-muted-foreground" /></div>}
          <div className="p-4">
            <div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted p-1">{university.logo_url ? <img src={university.logo_url} alt={university.logo_alt_text || `Official logo of ${university.name}`} className="max-h-full max-w-full object-contain" loading="lazy" /> : <Building2 className="h-5 w-5 text-muted-foreground" />}</div><div><h2 className="font-semibold group-hover:text-primary">{university.short_name}</h2><p className="text-sm text-muted-foreground line-clamp-2">{university.official_name}</p></div></div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-primary/10 px-2 py-1 text-primary">{university.institution_type}</span><span className="rounded-full bg-muted px-2 py-1 capitalize">{university.campus_launch_status}</span></div>
            <p className="mt-3 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{[university.city, university.region].filter(Boolean).join(', ') || 'Ghana'}</p>
          </div>
        </Link>)}</div>
      {filtered.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No recognised institution matches that search.</p>}
    </section>
  );
}
