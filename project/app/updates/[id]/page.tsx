import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Newspaper } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { CampusUpdateActions } from '@/components/feed/campus-update-actions';
import { CampusUpdateMedia } from '@/components/feed/campus-update-media';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { siteConfig } from '@/lib/constants/site';
import { publicSourceUrl } from '@/lib/ai/public-source-url';
import { updateCategory, updateDate, updateSummary } from '@/lib/ai/update-copy';
import { newsroomCampusArt, newsroomFields, type FeedItem } from '@/lib/ai/newsroom';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Props = { params: Promise<{ id: string }> };
async function getUpdate(id: string): Promise<FeedItem | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('campus_feed_public_items')
    .select(newsroomFields)
    .eq('id', id).maybeSingle();
  return error || !data ? null : data as FeedItem;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await getUpdate(id);
  if (!item) return { title: 'Campus update not found', robots: { index: false, follow: false } };
  const url = `${siteConfig.url}/updates/${item.id}`;
  const image = `${siteConfig.url}/api/campus-feed/alert-card?id=${encodeURIComponent(item.id)}&format=jpeg`;
  const description = updateSummary(item.excerpt, item.title, 180) || `A source-linked campus update from ${item.university_name}.`;
  return {
    title: `${item.title} | ${item.university_name}`,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'article', title: item.title, description, url, siteName: 'UniEco Ghana', locale: 'en_GH', images: [{ url: image, width: 1080, height: 1350, alt: `UniEco Ghana campus update: ${item.title}` }] },
    twitter: { card: 'summary_large_image', title: item.title, description, images: [image] },
  };
}

export default async function CampusUpdateDetailPage({ params }: Props) {
  const { id } = await params;
  const item = await getUpdate(id);
  if (!item) notFound();
  const category = updateCategory(item.category);
  const excerpt = updateSummary(item.excerpt, item.title);
  const source = publicSourceUrl(item.canonical_url);
  const campusPhoto = newsroomCampusArt(item.source_id);
  const supabase = await createClient();
  const { data: related } = await supabase.from('campus_feed_public_items').select('id,title,published_at')
    .eq('source_id', item.source_id).neq('id', item.id).order('published_at', { ascending: false, nullsFirst: false }).order('id').limit(4);

  return <>
    <SiteHeader />
    <main id="main-content" className="newsroom min-h-[65vh] bg-background text-foreground">
      <div className="mx-auto max-w-[64rem] px-4 py-5 sm:px-7 sm:py-8">
      <Link href="/updates" className="inline-flex min-h-[44px] items-center gap-2 text-sm font-bold text-primary hover:underline"><ArrowLeft className="h-4 w-4" />Campus Updates</Link>
      <article className="border-t-2 border-foreground py-4 sm:py-6">
        <header>
          <div className="newsroom-kicker flex items-center gap-2"><Newspaper className="h-4 w-4" />{category}</div>
          <h1 className="newsroom-headline mt-3 text-[clamp(1.95rem,5.6vw,3.9rem)] leading-[1.06]">{item.title}</h1>
          {excerpt && <p className="mt-4 max-w-3xl whitespace-pre-line text-base leading-7 text-muted-foreground sm:text-lg">{excerpt}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-border py-3 text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{item.source_label}</span>{item.published_at && <><span aria-hidden="true">·</span><time dateTime={item.published_at}>{updateDate(item.published_at, 'long')}</time></>}
          </div>
        </header>
        <div className="mt-4 grid gap-5">
          {campusPhoto && <figure>
            <div className="relative aspect-[2/1] bg-muted"><Image src={campusPhoto} alt="" fill sizes="(max-width: 1023px) 100vw, 968px" className="object-cover" priority /></div>
            <figcaption className="mt-1 text-xs text-muted-foreground">Campus file photo · {item.university_name}</figcaption>
          </figure>}
          <CampusUpdateMedia url={item.media_url} kind={item.media_type} publisher={item.source_label} sourceUrl={item.canonical_url} />
          {source && <div><Button asChild className="h-11"><a href={source.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Read the original update <ExternalLink className="ml-2 h-4 w-4" /></a></Button></div>}
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <CampusUpdateActions id={item.id} title={item.title} preload />
            <p className="text-sm text-muted-foreground">UniEco publishes independent summaries. Confirm requirements, deadlines, and changes with the original publisher.</p>
          </div>
        </div>
      </article>
      {!!related?.length && <section className="mt-6 border-t-2 border-foreground pt-3">
        <h2 className="newsroom-headline text-2xl">More from {item.source_label}</h2>
        <ul className="divide-y divide-border">{related.map((story) => <li key={story.id} className="py-3">
          <Link href={'/updates/' + story.id} className="newsroom-headline text-lg hover:text-primary hover:underline">{story.title}</Link>
          {story.published_at && <time dateTime={story.published_at} className="mt-1 block text-xs text-muted-foreground">{updateDate(story.published_at)}</time>}
        </li>)}</ul>
      </section>}
      </div>
    </main>
    <SiteFooter />
  </>;
}
