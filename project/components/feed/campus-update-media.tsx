import { ArrowUpRight, Image as PhotoIcon, PlayCircle } from 'lucide-react';
import { officialPublisherUrl, publisherHost } from '@/lib/ai/public-source-url';

/** Full-size media and videos stay with their original publisher. The selected
 * story thumbnail is handled separately by the approved-item photo renderer.
 * No arbitrary cross-site embeds, autoplay, iframes or visitor-supplied URLs. */
export function CampusUpdateMedia({ url, kind, publisher, sourceUrl }: {
  url: string | null; kind: 'image' | 'video' | null; publisher: string; sourceUrl: string;
}) {
  const source = officialPublisherUrl(sourceUrl);
  const media = officialPublisherUrl(url);
  if (!source || !media || !kind || publisherHost(source.hostname) !== publisherHost(media.hostname)) return null;
  const Icon = kind === 'video' ? PlayCircle : PhotoIcon;
  return <a href={media.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
    className="flex min-h-12 items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-sm font-semibold text-primary hover:underline">
    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
    <span className="min-w-0 flex-1 break-words">{kind === 'video' ? 'Watch video' : 'View photo'} · {publisher}</span>
    <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
  </a>;
}
