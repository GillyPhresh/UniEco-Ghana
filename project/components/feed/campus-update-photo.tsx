'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { FeedItem } from '@/lib/ai/newsroom';

export function CampusUpdatePhoto({ item, priority = false, sizes }: {
  item: Pick<FeedItem, 'id' | 'title' | 'source_id' | 'source_kind' | 'source_label'>; priority?: boolean; sizes: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const fallback = failed === item.id;
  const src = fallback ? null
    : '/api/campus-feed/alert-card?id=' + encodeURIComponent(item.id) + '&format=photo';
  return <div className="relative aspect-[2/1] overflow-hidden bg-muted">
    {src ? <>
      <Image src={src} alt={'Story visual for: ' + item.title} fill sizes={sizes} unoptimized priority={priority}
        className="object-cover" onError={() => setFailed(item.id)} />
    </> : <span className="newsroom-artwork-mark absolute inset-0 flex flex-col justify-center p-5 sm:p-10">
      <span className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">UniEco Ghana</span>
      <span className="newsroom-headline mt-1 max-w-[90%] text-3xl text-white sm:text-5xl">{item.source_label}</span>
    </span>}
  </div>;
}
