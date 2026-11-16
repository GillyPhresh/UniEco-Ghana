import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Button } from '@/components/ui/button';
import { bulletinQuery, loadBulletin, parseBulletinFilter } from '@/lib/ai/bulletin';
import { publicSourceUrl } from '@/lib/ai/public-source-url';
import { updateCategory, updateDate, updateSummary } from '@/lib/ai/update-copy';
import { BriefingControls } from './briefing-controls';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Campus briefing | UniEco Ghana', description: 'A source-linked roundup of approved tertiary campus updates.' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BulletinPage({ searchParams }: Props) {
  const query = await searchParams;
  const params = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => typeof value === 'string' ? [[key, value]] : []));
  const filter = parseBulletinFilter(params);
  let edition: Awaited<ReturnType<typeof loadBulletin>> = null;
  let failed = false;
  if (filter) {
    try { edition = await loadBulletin(filter); }
    catch { failed = true; }
  }
  const png = filter ? '/api/campus-feed/bulletin?' + bulletinQuery(filter) : '';
  return <>
    <div className="print:hidden"><SiteHeader /></div>
    <main className="container max-w-3xl px-4 py-6 sm:px-6 sm:py-10 print:m-0 print:max-w-none print:p-0">
      <Link href="/updates" className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary print:hidden"><ArrowLeft className="h-4 w-4" />Campus Updates</Link>
      <article className="overflow-hidden rounded-2xl border bg-card print:rounded-none print:border-0 print:bg-white print:text-black">
        <div className="h-1.5 bg-[linear-gradient(to_right,#c42f35_0%,#c42f35_33%,#edbe47_33%,#edbe47_66%,#148353_66%)] print:bg-green-800" />
        <header className="space-y-2 border-b border-border bg-primary/5 px-5 py-6 sm:px-8 print:bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.19em] text-primary print:text-green-900">UniEco Ghana · Campus news desk</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Campus briefing</h1>
          {edition && <p className="text-sm text-muted-foreground print:text-black">{edition.heading} · {edition.period}</p>}
        </header>
        {edition && filter ? <>
          <form action="/updates/bulletin" className="grid gap-3 border-b px-5 py-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end sm:px-8 print:hidden">
            <label className="grid min-w-0 gap-1 text-sm font-medium">Campus or source<select name="source" defaultValue={filter.source} className="min-h-11 rounded-lg border bg-background px-2"><option value="all">All campuses and opportunities</option>{edition.sources.map((entry) => <option key={entry.source_id} value={entry.source_id}>{entry.source_label}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Edition<select name="days" defaultValue={filter.days} className="min-h-11 rounded-lg border bg-background px-2"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All updates</option></select></label>
            <Button type="submit" className="min-h-11">View edition</Button>
          </form>
          <div className="px-5 py-5 sm:px-8">
            <p className="mb-3 text-sm font-medium text-muted-foreground print:text-black">{edition.total} approved updates · Page {edition.page} of {edition.pages}</p>
            {edition.items.length ? <ol className="divide-y">{edition.items.map((item) => {
              const source = publicSourceUrl(item.canonical_url);
              return <li key={item.id} className="space-y-2 py-4 print:break-inside-avoid">
                <p className="text-xs font-semibold text-primary print:text-green-900">{updateCategory(item.category)} · {updateDate(item.published_at)}</p>
                <h2 className="text-lg font-bold leading-snug"><Link href={'/updates/' + item.id}>{item.title}</Link></h2>
                {updateSummary(item.excerpt, item.title) && <p className="text-sm leading-6 text-muted-foreground print:text-black">{updateSummary(item.excerpt, item.title)}</p>}
                {source && <a href={source.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary print:text-green-900">{item.source_label} <ExternalLink className="h-3.5 w-3.5" /></a>}
              </li>;
            })}</ol> : <p className="rounded-xl border border-dashed p-5 text-sm">No approved updates in this edition. Try another time range.</p>}
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground print:text-black">Independent UniEco Ghana briefing. Check the original publishers for full and current details.</p>
          </div>
        </> : <div className="space-y-3 px-5 py-6"><p role="status">{failed ? 'The campus briefing could not load. Please retry.' : 'This briefing edition or page is not available.'}</p><Link href="/updates/bulletin" className="text-primary underline">Open the latest edition</Link></div>}
      </article>
      {edition && filter && <div className="mt-4 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          {edition.total > 0 && <Button asChild><a href={png + '&download=1'} download><Download className="mr-2 h-4 w-4" />Save this page as PNG</a></Button>}
          <BriefingControls />
        </div>
        {edition.pages > 1 && <nav aria-label="Briefing pages" className="flex flex-wrap gap-2">
          {edition.page > 1 && <Button asChild variant="outline"><Link href={'/updates/bulletin?' + bulletinQuery({ ...filter, page: edition.page - 1 })}>Previous page</Link></Button>}
          {edition.page < edition.pages && <Button asChild variant="outline"><Link href={'/updates/bulletin?' + bulletinQuery({ ...filter, page: edition.page + 1 })}>Next page</Link></Button>}
        </nav>}
      </div>}
    </main>
    <div className="print:hidden"><SiteFooter /></div>
  </>;
}
