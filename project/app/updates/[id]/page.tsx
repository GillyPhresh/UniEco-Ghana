/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Newspaper } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { CampusUpdateActions } from '@/components/feed/campus-update-actions';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { siteConfig } from '@/lib/constants/site';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Props = { params: Promise<{ id: string }> };
type PublicUpdate = {
  id: string; source_label: string; university_name: string; title: string;
  excerpt: string; canonical_url: string; published_at: string | null;
  media_url: string | null; media_type: 'image' | 'video' | null; category: string;
};

async function getUpdate(id: string): Promise<PublicUpdate | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('campus_feed_public_items')
    .select('id,source_label,university_name,title,excerpt,canonical_url,published_at,media_url,media_type,category')
    .eq('id', id).maybeSingle();
  return error || !data ? null : data as PublicUpdate;
}

function dateLabel(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Recently published';
  return new Intl.DateTimeFormat('en-GH', { dateStyle: 'long', timeZone: 'Africa/Accra' }).format(new Date(value));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await getUpdate(id);
  if (!item) return { title: 'Campus update not found', robots: { index: false, follow: false } };
  const url = `${siteConfig.url}/updates/${item.id}`;
  const image = `${siteConfig.url}/api/campus-feed/alert-card?id=${encodeURIComponent(item.id)}`;
  const description = item.excerpt.trim().slice(0, 180) || `A source-linked campus update from ${item.university_name}.`;
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
  const category = item.category === 'opportunities' ? 'Student opportunity' : item.category.replaceAll('_', ' ');
  const excerpt = item.excerpt.toLocaleLowerCase().startsWith(item.title.toLocaleLowerCase())
    ? item.excerpt.slice(item.title.length).replace(/^[\s:|–—-]+/, '').trim()
    : item.excerpt;

  return <>
    <SiteHeader />
    <main className="container min-h-[65vh] max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/updates" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />All campus updates</Link>
      <article className="mt-4 overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="border-b bg-gradient-to-br from-primary/10 via-background to-amber-50/60 p-5 sm:p-8">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><Newspaper className="h-4 w-4" />{category}</div>
          <h1 className="mt-4 text-2xl font-bold leading-tight tracking-tight sm:text-4xl">{item.title}</h1>
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"><span className="font-semibold text-foreground">{item.university_name}</span><span aria-hidden="true">·</span><span>{dateLabel(item.published_at)}</span></div>
        </div>
        <div className="space-y-5 p-5 sm:p-8">
          {excerpt && <p className="whitespace-pre-line text-base leading-7 text-foreground/85">{excerpt}</p>}
          {item.media_url && item.media_type === 'video' && <video controls playsInline preload="metadata" className="max-h-[65vh] w-full rounded-2xl bg-black" aria-label={item.title}><source src={item.media_url} /></video>}
          {item.media_url && item.media_type === 'image' && <a href={item.media_url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border bg-muted"><img src={item.media_url} alt={`Image from ${item.source_label}`} className="max-h-[65vh] w-full object-contain" referrerPolicy="no-referrer" /></a>}
          <div className="rounded-xl border border-primary/15 bg-primary/[0.035] p-4 text-sm leading-6 text-muted-foreground">UniEco shares source-linked summaries and is not the university or original publisher. Check the source for full details, eligibility, deadlines, and changes.</div>
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <CampusUpdateActions id={item.id} title={item.title} excerpt={excerpt} sourceLabel={item.source_label} universityName={item.university_name} />
            <Button asChild variant="outline" className="min-h-11"><a href={item.canonical_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open original source <ExternalLink className="ml-2 h-4 w-4" /></a></Button>
          </div>
        </div>
      </article>
    </main>
    <SiteFooter />
  </>;
}
