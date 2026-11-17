import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { CampusUpdates } from '@/components/feed/campus-updates';
import { createPublicPageMetadata } from '@/lib/seo/metadata';
import { newsroomEditionTag, newsroomFields, newsroomPageSize, type FeedItem } from '@/lib/ai/newsroom';

export const metadata = createPublicPageMetadata({
  title: 'Campus Updates',
  description: 'University news, events, opportunities, research and notices from trusted official sources.',
  path: '/updates',
});

async function firstEdition(): Promise<FeedItem[] | undefined> {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!origin || !key) return undefined;
  try {
    const url = new URL('/rest/v1/campus_feed_public_items', origin);
    url.search = new URLSearchParams({ select: newsroomFields, order: 'published_at.desc.nullslast,id.asc', limit: String(newsroomPageSize) }).toString();
    const response = await fetch(url, { headers: { apikey: key, Authorization: 'Bearer ' + key }, next: { revalidate: 90, tags: [newsroomEditionTag] },
      signal: AbortSignal.timeout(5000) });
    if (!response.ok) return undefined;
    const rows = await response.json();
    return Array.isArray(rows) ? rows : undefined;
  } catch { return undefined; }
}

export default async function UpdatesPage() {
  const initialItems = await firstEdition();
  return <>
    <SiteHeader />
    <main id="main-content" className="newsroom min-h-[65vh] bg-background text-foreground">
      <div className="mx-auto w-full max-w-[80rem] px-4 pb-12 sm:px-6 lg:px-10">
        <CampusUpdates initialItems={initialItems} />
      </div>
    </main>
    <SiteFooter />
  </>;
}
