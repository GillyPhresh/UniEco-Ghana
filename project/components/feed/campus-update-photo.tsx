'use client';

import Image from 'next/image';
import { useState } from 'react';
import { newsroomCampusArt, type FeedItem } from '@/lib/ai/newsroom';

export function CampusUpdatePhoto({ item, priority = false, sizes }: {
  item: Pick<FeedItem, 'id' | 'title' | 'source_id' | 'source_label'>; priority?: boolean; sizes: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const fallback = failed === item.id;
  const src = fallback ? newsroomCampusArt(item.source_id) : '/api/campus-feed/alert-card?id=' + encodeURIComponent(item.id) + '&format=photo';
  return <div className="relative aspect-[2/1] overflow-hidden bg-muted">
    {src ? <>
      <Image src={src} alt={'Image for: ' + item.title} fill sizes={sizes} unoptimized={!fallback} priority={priority}
        className="object-cover" onError={() => setFailed(item.id)} />
      {fallback && <span className="absolute bottom-2 left-2 max-w-[90%] bg-black/75 px-2 py-1 text-[10px] text-white">Campus file photo · {item.source_label}</span>}
    </> : <span className="newsroom-artwork-mark absolute inset-0 flex flex-col justify-center p-5 sm:p-10">
      <span className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">UniEco Ghana</span>
      <span className="newsroom-headline mt-1 max-w-[90%] text-3xl text-white sm:text-5xl">{item.source_label}</span>
    </span>}
  </div>;
}
