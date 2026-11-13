'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, MapPin, Search } from 'lucide-react';

type NearbyPlace = {
  id: string;
  name: string;
  category: string;
  address: string;
  googleMapsUri: string;
  websiteUri: string;
  source: 'OpenStreetMap';
  osmUrl: string;
};

const categories = [
  { label: 'Food', query: 'food' },
  { label: 'Shops & services', query: 'services' },
  { label: 'Hostels', query: 'hostel' },
  { label: 'Pharmacies', query: 'pharmacy' },
  { label: 'Banks & ATMs', query: 'bank' },
  { label: 'Transport', query: 'transport' },
] as const;

export function CampusNearbyDiscovery({ campus }: { campus: string }) {
  const [activeQuery, setActiveQuery] = useState('');
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [campusAddress, setCampusAddress] = useState('');

  async function search(query: string) {
    setActiveQuery(query);
    setBusy(true);
    setError('');
    setPlaces([]);
    try {
      const params = new URLSearchParams({ q: query, campus });
      const response = await fetch(`/api/maps/open-places/search?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Nearby search is temporarily unavailable.');
      setPlaces(Array.isArray(payload.places) ? payload.places : []);
      setCampusAddress(typeof payload.campusAddress === 'string' ? payload.campusAddress : '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nearby search is temporarily unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return <section aria-labelledby="nearby-campus-title" className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Explore nearby</p>
        <h2 id="nearby-campus-title" className="mt-1 text-xl font-bold text-foreground sm:text-2xl">Places around this campus</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Look up nearby food, shops, hostels, pharmacies and everyday services. These are community-mapped places, not UniEco-verified vendors.</p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{campus}</span>
    </div>

    <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Nearby place categories">
      {categories.map((category) => <button key={category.query} type="button" onClick={() => void search(category.query)} disabled={busy} aria-pressed={activeQuery === category.query} className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${activeQuery === category.query ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:border-primary/50'}`}>
        {busy && activeQuery === category.query ? <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> : null}{category.label}
      </button>)}
    </div>

    {busy && <p className="mt-4 text-sm text-muted-foreground" role="status">Finding places near campus…</p>}
    {error && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"><span className="text-destructive">{error}</span><button type="button" onClick={() => activeQuery && void search(activeQuery)} className="min-h-10 font-semibold text-primary underline underline-offset-4">Try again</button></div>}
    {!busy && !error && activeQuery && places.length === 0 && <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No mapped places came back for this category yet. Try another category or check Google Maps for a wider search.</p>}

    {places.length > 0 && <>
      <p className="mt-4 text-xs text-muted-foreground">{places.length} mapped results{campusAddress ? ` · Search area: ${campusAddress}` : ''}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{places.map((place) => <article key={place.id} className="min-w-0 rounded-2xl border border-border bg-background p-4">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate font-semibold text-foreground">{place.name}</h3><p className="mt-1 text-xs text-muted-foreground">{place.category}</p></div><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">Open map data</span></div>
        {place.address && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{place.address}</p>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm"><a href={place.googleMapsUri} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary underline underline-offset-4">Open map <ExternalLink className="h-3.5 w-3.5" /></a>{place.websiteUri && <a href={place.websiteUri} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 text-muted-foreground underline underline-offset-4">Website <ExternalLink className="h-3.5 w-3.5" /></a>}</div>
      </article>)}</div>
      <p className="mt-3 text-[11px] text-muted-foreground">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">OpenStreetMap contributors</a>. Coverage can be incomplete; confirm details with the place before travelling.</p>
    </>}

    {!activeQuery && <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Search className="h-3.5 w-3.5" />Choose a category to look up places now. Results are fetched live and are not copied into UniEco listings.</p>}
  </section>;
}
