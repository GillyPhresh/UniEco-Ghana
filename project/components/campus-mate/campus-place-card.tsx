'use client';

import Link from 'next/link';
import { ArrowUpRight, BadgeCheck, CalendarDays, Compass, Globe2, MapPin, Navigation, Phone, Star, Store, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { CatalogPhoto } from '@/components/marketplace/catalog-photo';
import { catalogPhotos } from '@/lib/marketplace/catalog';
import { cn } from '@/lib/utils';

const sizes = '(max-width: 639px) 92vw, (max-width: 1023px) 48vw, 33vw';

export function PlaceArtwork({ photo, logo, backdrop, icon: Icon }: {
  photo?: string | null; logo?: string | null; backdrop?: string; icon: LucideIcon;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const usable = (src?: string | null) => catalogPhotos(src).find(value => !failed.includes(value));
  const listingPhoto = usable(photo);
  const brandLogo = usable(logo);
  const illustration = usable(backdrop);
  const src = listingPhoto || brandLogo || illustration;
  const categoryPhoto = Boolean(src && src === illustration && !listingPhoto && !brandLogo);
  return <div className="relative aspect-[16/9] overflow-hidden bg-[radial-gradient(circle_at_24%_20%,hsl(var(--primary)/.21),transparent_70%)]">
    {src ? <CatalogPhoto sources={[src]} alt="" sizes={sizes} contain={Boolean(brandLogo && !listingPhoto)} fallback={Icon}
      onUnavailable={() => setFailed(current => current.includes(src) ? current : [...current, src])} />
      : <div className="absolute inset-0 grid place-items-center bg-muted/40 text-primary"><Icon className="h-9 w-9" aria-hidden="true" /></div>}
    {categoryPhoto && <span className="absolute bottom-2 right-2 rounded-full bg-black/75 px-2.5 py-1 text-[10px] font-medium text-white">Category photo</span>}
  </div>;
}

export function CampusPlaceCard({ name, category, source, address, date, distance, rating, verified, photo, logo, backdrop,
  active, directions, details, externalDetails, telephone, website, onMap }: {
  name: string; category: string; source: 'business' | 'event' | 'community'; address?: string | null;
  date?: string | null; distance?: number | null; rating?: number | null; verified?: boolean;
  photo?: string | null; logo?: string | null; backdrop?: string; active?: boolean;
  directions?: string | null; details?: string | null; externalDetails?: string | null; telephone?: string | null; website?: string | null; onMap: () => void;
}) {
  const Icon = source === 'event' ? CalendarDays : source === 'community' ? Compass : Store;
  return <article className={cn('group flex min-w-0 flex-col overflow-hidden rounded-[1.35rem] border bg-card transition-shadow hover:shadow-md', active && 'border-primary ring-2 ring-primary/20')}>
    <PlaceArtwork key={JSON.stringify([photo, logo, backdrop])} photo={photo} logo={logo} backdrop={backdrop} icon={Icon} />
    <div className="flex flex-1 flex-col gap-2.5 p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">{category}</span>
        {verified && source === 'business' && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified</span>}
        {source === 'community' && <span className="text-[11px] font-medium text-muted-foreground">OpenStreetMap</span>}
      </div>
      <div>
        <h3 className="break-words text-base font-bold leading-tight tracking-tight">{name}</h3>
        {address && <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span className="break-words">{address}</span></p>}
        {date && <p className="mt-1 text-xs font-semibold text-primary">{date}</p>}
      </div>
      {((typeof rating === 'number' && rating > 0) || distance != null) && <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
        {typeof rating === 'number' && rating > 0 && <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden="true" /> {rating.toFixed(1)}</span>}
        {distance != null && <span>{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} away</span>}
      </div>}
      <div className="mt-auto flex flex-wrap gap-2 pt-2 text-xs font-semibold">
        {directions && <a href={directions} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-3 text-primary-foreground hover:opacity-90"><Navigation className="h-3.5 w-3.5" aria-hidden="true" /> Directions</a>}
        <button type="button" aria-pressed={Boolean(active)} onClick={onMap} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 hover:bg-muted"><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Map</button>
        {details && <Link href={details} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-primary hover:bg-muted">Details <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
        {externalDetails && <a href={externalDetails} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-primary hover:bg-muted">Source <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a>}
        {telephone && <a href={telephone} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 hover:bg-muted"><Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call</a>}
        {website && <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 hover:bg-muted"><Globe2 className="h-3.5 w-3.5" aria-hidden="true" /> Website</a>}
      </div>
    </div>
  </article>;
}
