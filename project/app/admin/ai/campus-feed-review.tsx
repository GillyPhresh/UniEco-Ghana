'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ClipboardCheck, FileImage, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { publicSourceUrl } from '@/lib/ai/public-source-url';
import { updateCategory, updateDate, updateSummary } from '@/lib/ai/update-copy';
import { editorialRequest, type SourceOption } from './editorial-types';

type ReviewItem = {
  id: string; source_id: string; source_label: string; university_name: string;
  title: string; excerpt: string; canonical_url: string; published_at: string | null;
  media_url: string | null; media_type: 'image' | 'video' | null; category: string;
  status: 'pending' | 'approved' | 'rejected'; review_reason: string | null; updated_at: string;
};
const statuses = [['pending', 'Needs review'], ['approved', 'Published'], ['rejected', 'Rejected']] as const;
type Status = (typeof statuses)[number][0];

export function CampusFeedReview({ sources, onDecision }: { sources: SourceOption[]; onDecision: () => void }) {
  const [status, setStatus] = useState<Status>('pending');
  const [scope, setScope] = useState('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: ReviewItem[]; total: number; pages: number } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const task = new AbortController();
    const params = new URLSearchParams({ status, page: String(page), ...(scope === 'all' ? {} : { source: scope }) });
    setResult(null);
    setError('');
    void (async () => {
      try {
        const response = await fetch('/api/admin/campus-feed?' + params, { cache: 'no-store', signal: task.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'The review queue could not load.');
        if (!task.signal.aborted) setResult(data);
      } catch (failure) {
        if (!task.signal.aborted) setError(failure instanceof Error ? failure.message : 'The review queue could not load.');
      }
    })();
    return () => task.abort();
  }, [status, scope, page, revision]);
  const refresh = () => setRevision((value) => value + 1);

  return <section className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="campus-review">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 id="campus-review" className="flex items-center gap-2 text-lg font-bold"><ClipboardCheck className="h-5 w-5 text-primary" />Campus feed review</h2><p className="mt-1 text-sm text-muted-foreground">Review the publisher, dates and content before you publish. This does not send a notification.</p></div>
      <Button size="sm" variant="outline" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
    </div>
    <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,22rem)]">
      <div className="flex flex-wrap gap-1.5" aria-label="Review status">{statuses.map(([id, label]) => <Button key={id} size="sm" className="min-h-10" type="button" variant={id === status ? 'default' : 'outline'} aria-pressed={id === status} onClick={() => { setStatus(id); setPage(1); }}>{label}</Button>)}</div>
      <label className="grid min-w-0 gap-1 text-sm font-semibold">Filter by publisher
        <select className="min-h-11 min-w-0 rounded-lg border bg-background px-2 text-sm" value={scope} onChange={(event) => { setScope(event.target.value); setPage(1); }}>
          <option value="all">All publishers</option>{Array.from(new Map(sources.filter((source) => source.registered && source.feedSourceId).map((source) => [source.feedSourceId!, source.label])).entries()).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
    </div>
    {error ? <p role="alert" className="rounded-lg border border-destructive/20 p-3 text-sm">{error}</p>
      : !result ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading review queue…</p>
      : !result.items.length ? <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No {status === 'pending' ? 'updates waiting for review' : status + ' updates'} in this selection.</p>
      : <ol className="space-y-3">{result.items.map((item) => <ReviewCard key={item.id + item.updated_at} item={item} onDecision={() => { refresh(); onDecision(); }} />)}</ol>}
    {result && result.pages > 1 && <nav className="flex flex-wrap items-center gap-2" aria-label="Review pages">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
      <span className="text-sm text-muted-foreground">{page} of {result.pages} · {result.total} updates</span>
      <Button type="button" variant="outline" size="sm" disabled={page >= result.pages} onClick={() => setPage(page + 1)}>Next</Button>
    </nav>}
    {result && page > result.pages && <Button variant="outline" size="sm" onClick={() => setPage(result.pages)}>Return to last page</Button>}
  </section>;
}

function ReviewCard({ item, onDecision }: { item: ReviewItem; onDecision: () => void }) {
  const [note, setNote] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<'hidden' | 'shown' | 'unavailable'>('hidden');
  const [drafted, setDrafted] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const source = publicSourceUrl(item.canonical_url);
  const media = publicSourceUrl(item.media_url);
  const excerpt = updateSummary(item.excerpt, item.title);
  const base = '/api/admin/campus-feed/preview?id=' + item.id;
  const reasonValid = note.trim().length >= 10 && note.trim().length <= 500;
  const pending = item.status === 'pending';
  const published = item.status === 'approved';
  const review = async (decision: 'approved' | 'rejected') => {
    if (!reasonValid || busy || (decision === 'approved' && !verified)) return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/campus-feed', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.id, decision, reason: note, sourceConfirmed: verified, reviewedVersion: item.updated_at }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The decision could not be saved.');
      toast.success(decision === 'approved' ? 'Published to Campus Updates. No notification sent.' : published ? 'Update unpublished.' : 'Update rejected.');
      onDecision();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'The decision could not be saved.'); }
    finally { setBusy(false); }
  };
  const draftNotification = async () => {
    setDraftBusy(true);
    try {
      await editorialRequest('draft', { itemId: item.id });
      setDrafted(true);
      toast.success('Separate notification draft ready in Broadcasts. Nothing was sent.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not prepare the notification draft.'); }
    finally { setDraftBusy(false); }
  };
  return <li className="min-w-0 space-y-3 rounded-xl border p-3.5 sm:p-4">
    <div className="flex flex-wrap gap-1.5 text-xs"><Badge variant="secondary">{item.university_name}</Badge><Badge variant="outline">{updateCategory(item.category)}</Badge><span className="self-center text-muted-foreground">{updateDate(item.published_at)}</span></div>
    <h3 className="break-words text-base font-bold leading-snug">{item.title}</h3>
    {excerpt && <p className="break-words text-sm leading-6 text-muted-foreground">{excerpt}</p>}
    <div className="flex flex-wrap gap-2">
      {source && <Button asChild size="sm" variant="outline"><a href={source.href} target="_blank" rel="noopener noreferrer">Original source <ArrowUpRight className="ml-1.5 h-4 w-4" /></a></Button>}
      {published ? <Button asChild size="sm" variant="outline"><Link href={'/updates/' + item.id} target="_blank">Public update &amp; flyer <ArrowUpRight className="ml-1.5 h-4 w-4" /></Link></Button>
        : <Button asChild size="sm" variant="outline"><a href={base} target="_blank" rel="noopener noreferrer"><FileImage className="mr-1.5 h-4 w-4" />Preview draft flyer</a></Button>}
      {media && item.media_type === 'image' && photo === 'hidden' && <Button size="sm" variant="outline" onClick={() => setPhoto('shown')}>Preview source photo</Button>}
      {media && item.media_type === 'video' && <Button asChild size="sm" variant="outline"><a href={media.href} target="_blank" rel="noopener noreferrer">Open source video <ArrowUpRight className="ml-1.5 h-4 w-4" /></a></Button>}
    </div>
    {photo === 'shown' && <Image unoptimized src={base + '&format=photo'} width={900} height={600} alt={'Preview from ' + item.source_label}
      className="max-h-72 w-full rounded-lg border bg-muted object-contain" onError={() => setPhoto('unavailable')} />}
    {photo === 'unavailable' && <p className="text-xs text-muted-foreground">The photo could not be previewed. Check the original source directly.</p>}
    {item.media_type && <p className="text-xs text-muted-foreground">Public updates link back to the publisher’s media. UniEco does not copy or rehost it.</p>}
    {(pending || published) && <div className="space-y-2 border-t pt-3">
      {!item.published_at && pending && <p className="text-xs font-medium text-muted-foreground">No publication date was supplied. Make sure this update is still relevant before publishing.</p>}
      {pending && <label className="flex items-start gap-2 text-sm font-medium"><input type="checkbox" className="mt-1" checked={verified} onChange={(event) => setVerified(event.target.checked)} disabled={busy || !source} />I checked the publisher, accuracy, dates and campus.</label>}
      <label htmlFor={'editorial-note-' + item.id} className="block text-sm font-semibold">{pending ? 'Review note' : 'Unpublish note'} <span className="font-normal text-muted-foreground">· private audit record</span></label>
      <textarea id={'editorial-note-' + item.id} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy}
        minLength={10} maxLength={500} className="min-h-20 w-full rounded-lg border bg-background p-2.5 text-sm focus-visible:outline-primary" placeholder="Record what you verified or why this update needs to be removed…" />
      <div className="flex flex-wrap gap-2">
        {pending && <Button className="min-h-11" type="button" disabled={busy || !verified || !reasonValid} onClick={() => void review('approved')}><ShieldCheck className="mr-2 h-4 w-4" />Publish update</Button>}
        <Button className="min-h-11" type="button" variant="outline" disabled={busy || !reasonValid} onClick={() => void review('rejected')}>{published ? 'Unpublish' : 'Reject'}</Button>
        {published && <Button className="min-h-11" type="button" variant="ghost" disabled={draftBusy || drafted} onClick={() => void draftNotification()}>{drafted ? 'Draft ready in Broadcasts' : 'Prepare notification draft'}</Button>}
      </div>
    </div>}
    {!pending && item.review_reason && <p className="break-words text-xs text-muted-foreground">Previous review: {item.review_reason}</p>}
  </li>;
}
