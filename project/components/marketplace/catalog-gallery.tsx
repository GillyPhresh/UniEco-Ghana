'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { CatalogPhoto } from './catalog-photo';
import { catalogPhotos } from '@/lib/marketplace/catalog';
import { cn } from '@/lib/utils';

export function CatalogGallery({ name, sources, fallback }: {
  name: string;
  sources: (string | null | undefined)[];
  fallback?: LucideIcon;
}) {
  const photos = catalogPhotos(sources);
  const [current, setCurrent] = useState(0);
  const index = Math.min(current, Math.max(0, photos.length - 1));

  function move(step: number) {
    setCurrent((index + step + photos.length) % photos.length);
  }

  return <section aria-label={`${name} photos`}>
    <div className="relative aspect-[5/4] overflow-hidden rounded-2xl border border-border bg-muted sm:aspect-[4/3]">
      <CatalogPhoto sources={[photos[index]]} alt={photos.length > 1 ? `${name}, photo ${index + 1}` : name}
        sizes="(min-width: 1024px) 550px, 96vw" priority contain fallback={fallback} />
      {photos.length > 1 && <>
        <button type="button" aria-label="Previous photo" onClick={() => move(-1)}
          className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground shadow focus-visible:ring-2 focus-visible:ring-primary"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
        <button type="button" aria-label="Next photo" onClick={() => move(1)}
          className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground shadow focus-visible:ring-2 focus-visible:ring-primary"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
        <span className="absolute bottom-2 right-2 rounded-full bg-background px-2 py-1 text-xs font-semibold" aria-live="polite">{index + 1} / {photos.length}</span>
      </>}
    </div>
    {photos.length > 1 && <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
      {photos.map((photo, n) => <button type="button" key={photo} onClick={() => setCurrent(n)}
        aria-label={`Show photo ${n + 1}`} aria-pressed={n === index}
        className={cn('relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-muted focus-visible:ring-2 focus-visible:ring-primary', n === index ? 'border-primary' : 'border-border')}>
        <CatalogPhoto sources={[photo]} alt="" sizes="56px" />
      </button>)}
    </div>}
  </section>;
}
