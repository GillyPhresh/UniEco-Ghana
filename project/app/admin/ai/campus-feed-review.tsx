'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, ExternalLink, Loader2, Newspaper, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ReviewItem = {
  id: string;
  source_id: string;
  source_label: string;
  university_name: string;
  title: string;
  excerpt: string;
  canonical_url: string;
  published_at: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  category: string;
  status: 'pending' | 'approved' | 'rejected';
  review_reason: string | null;
  fetched_at: string;
};

const statuses = ['pending', 'approved', 'rejected'] as const;

export function CampusFeedReview() {
  const [status, setStatus] = useState<(typeof statuses)[number]>('pending');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/admin/campus-feed?status=${status}`, { cache: 'no-store' });
      const data = await response.json() as { items?: ReviewItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not load the review queue.');
      setItems(data.items || []);
    } catch (error) {
      setItems([]);
      setFailed(true);
      toast.error(error instanceof Error ? error.message : 'Could not load the review queue.');
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const review = async (item: ReviewItem, decision: 'approved' | 'rejected') => {
    const reason = (notes[item.id] || '').trim();
    if (reason.length < 10 || reason.length > 500) {
      toast.error('Add a short review note (10–500 characters) for the audit record.');
      return;
    }
    setBusyId(item.id);
    try {
      const response = await fetch('/api/admin/campus-feed', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.id, decision, reason }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'The review decision could not be saved.');
      toast.success(decision === 'approved' ? 'Update published to Campus Updates.' : 'Update rejected and kept out of the public feed.');
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'The review decision could not be saved.'); }
    finally { setBusyId(null); }
  };

  return <Card className="overflow-hidden">
    <CardHeader className="border-b bg-muted/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><CardTitle className="flex items-center gap-2 text-base"><Newspaper className="h-5 w-5 text-primary" /> Campus feed review</CardTitle><p className="mt-1 text-sm text-muted-foreground">Only an authorized super admin can approve items for the public feed. Nothing is broadcast by this action.</p></div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pt-2" role="tablist" aria-label="Campus feed review status">
        {statuses.map((value) => <button key={value} type="button" role="tab" aria-selected={status === value} onClick={() => setStatus(value)} className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold capitalize ${status === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{value === 'pending' ? 'Needs review' : value}</button>)}
      </div>
    </CardHeader>
    <CardContent className="p-3 sm:p-5">
      {loading ? <div className="flex min-h-36 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading review queue…</div>
        : failed ? <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-muted-foreground">The review queue could not be reached. Refresh to retry; no decision was made.</div>
        : items.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center"><BadgeCheck className="mx-auto h-7 w-7 text-primary/70" /><p className="mt-2 font-semibold">{status === 'pending' ? 'No updates waiting for review' : `No ${status} items yet`}</p><p className="mt-1 text-sm text-muted-foreground">New leads from reviewed university and opportunity sources appear here before publication.</p></div>
            : <div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-xl border p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{item.source_label}</Badge><Badge variant="outline" className="capitalize">{item.category.replace('_', ' ')}</Badge><span className="text-xs text-muted-foreground">{item.published_at ? new Date(item.published_at).toLocaleDateString('en-GH') : 'Date not supplied'}</span></div>
              <h3 className="mt-3 text-base font-bold leading-snug">{item.title}</h3>
              <p className="mt-1 text-xs font-medium text-muted-foreground">{item.university_name}</p>
              {item.excerpt && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.excerpt}</p>}
              {item.media_url && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><span>{item.media_type === 'video' ? 'Source-hosted video detected' : 'Source-hosted image detected'}.</span><span>Review the source before approval.</span></p>}
              <a href={item.canonical_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-semibold text-primary">Open original source <ExternalLink className="h-4 w-4" /></a>
              {status === 'pending' && <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-muted-foreground">Before approval, check that the source is authentic, the page supports the headline, and dates, eligibility, and deadlines are still current. For major claims, compare a second independent or primary source.</p>}
              {status === 'pending' && <div className="mt-4 border-t pt-4"><label htmlFor={`feed-note-${item.id}`} className="text-sm font-semibold">Review note <span className="font-normal text-muted-foreground">(required for audit)</span></label><textarea id={`feed-note-${item.id}`} maxLength={500} minLength={10} value={notes[item.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Confirm why this item is suitable, accurate and relevant…" className="mt-2 min-h-20 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10" /><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><Button className="min-h-11" onClick={() => void review(item, 'approved')} disabled={busyId === item.id}><BadgeCheck className="mr-2 h-4 w-4" />Approve for Campus Updates</Button><Button className="min-h-11" variant="outline" onClick={() => void review(item, 'rejected')} disabled={busyId === item.id}><XCircle className="mr-2 h-4 w-4" />Reject</Button></div>{busyId === item.id && <p className="mt-2 text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Saving review…</p>}</div>}
              {status !== 'pending' && item.review_reason && <div className="mt-3 flex gap-2 rounded-lg bg-muted/55 p-3 text-xs text-muted-foreground"><ShieldAlert className="h-4 w-4 shrink-0" /><span>Review note: {item.review_reason}</span></div>}
            </article>)}</div>}
    </CardContent>
  </Card>;
}
