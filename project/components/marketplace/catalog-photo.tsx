'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ImageOff, type LucideIcon } from 'lucide-react';
import { catalogPhotos } from '@/lib/marketplace/catalog';
import { cn } from '@/lib/utils';

export function CatalogPhoto({ sources, alt, sizes, priority = false, contain = false, fallback: Fallback = ImageOff, onUnavailable }: {
  sources: (string | null | undefined)[];
  alt: string;
  sizes: string;
  priority?: boolean;
  contain?: boolean;
  fallback?: LucideIcon;
  onUnavailable?: (photo: string) => void;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const photo = catalogPhotos(sources).find(src => !failed.includes(src));
  if (!photo) return (
    <span className="absolute inset-0 grid place-items-center bg-muted text-muted-foreground" aria-hidden="true">
      <Fallback className="h-7 w-7 opacity-60" />
    </span>
  );
  return <Image
    key={photo}
    src={photo}
    alt={alt}
    fill
    sizes={sizes}
    loading={priority ? undefined : 'lazy'}
    priority={priority}
    className={cn(contain ? 'object-contain p-5' : 'object-cover', 'motion-safe:transition-transform motion-safe:duration-300 group-hover:scale-[1.025]')}
    onError={() => {
      setFailed(previous => previous.includes(photo) ? previous : [...previous, photo]);
      onUnavailable?.(photo);
    }}
  />;
}
