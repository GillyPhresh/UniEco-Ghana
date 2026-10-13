'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { getAdminReviewQueue, moderateAdminReview } from '@/lib/data/admin-client';
import type { AdminReviewQueueItem } from '@/lib/types/admin';
import { Check, ChevronLeft, ChevronRight, EyeOff, Flag, Search, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 25;
const STATUS_FILTERS = [
  ['pending_review', 'Pending'], ['flagged', 'Flagged'], ['published', 'Published'],
  ['hidden', 'Hidden'], ['removed', 'Removed'], ['all', 'All'],
] as const;
type ReviewDecision = 'published' | 'hidden' | 'removed';

export default function AdminReviewsPage() {
  return <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>;
}

function Content() {
  const [reviews, setReviews] = useState<AdminReviewQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('pending_review');
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminReviewQueueItem | null>(null);
  const [confirmation, setConfirmation] = useState<ReviewDecision | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const requestVersion = useRef(0);

  const loadReviews = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getAdminReviewQueue({ status, search, limit: PAGE_SIZE, offset });
      if (version !== requestVersion.current) return;
      setReviews(result.reviews);
      setTotal(result.total);
    } catch {
      if (version !== requestVersion.current) return;
      setLoadError('Unable to load reviews. Please retry.');
      setReviews([]);
      setTotal(0);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [offset, search, status]);

  useEffect(() => {
    void loadReviews();
    return () => { requestVersion.current += 1; };
  }, [loadReviews]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchText.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  function closeReview() {
    setSelected(null);
    setConfirmation(null);
    setReason('');
  }

  async function confirmModeration() {
    if (!selected || !confirmation) return;
    const cleanReason = reason.trim();
    if (confirmation !== 'published' && (cleanReason.length < 10 || cleanReason.length > 500)) {
      toast.error('Enter a moderation reason between 10 and 500 characters.');
      return;
    }
    setSaving(true);
    try {
      const result = await moderateAdminReview(selected.review_id, confirmation, cleanReason || undefined);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Review ${confirmation === 'published' ? 'published' : confirmation}.`);
      closeReview();
      await loadReviews();
    } catch {
      toast.error('Unable to update review moderation status. Please retry.');
    } finally {
      setSaving(false);
    }
  }

  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
          <Star className="h-6 w-6 text-primary" /> Review &amp; Reputation Center
        </h1>
        <p className="text-sm text-muted-foreground">Review user-submitted ratings and comments. Every moderation decision is authorized and recorded by the database.</p>
      </header>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div aria-label="Review status filter" className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map(([value, label]) => (
                <Button key={value} size="sm" variant={status === value ? 'default' : 'outline'} onClick={() => { setStatus(value); setOffset(0); }}>
                  {label}
                </Button>
              ))}
            </div>
            <div className="relative w-full lg:max-w-sm">
              <Label htmlFor="review-search" className="sr-only">Search reviews, vendors, or universities</Label>
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="review-search" className="pl-9" value={searchText} maxLength={100} onChange={event => setSearchText(event.target.value)} placeholder="Search reviews, vendors, universities" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">{loading ? 'Loading reviews…' : `${total} reviews`}</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2" aria-label="Loading reviews">{[1, 2, 3].map(item => <Skeleton key={item} className="h-16 rounded-lg" />)}</div>
      ) : loadError ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" onClick={() => void loadReviews()}>Retry</Button>
        </CardContent></Card>
      ) : reviews.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No reviews match this filter.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Review</TableHead><TableHead>Target</TableHead><TableHead>University</TableHead>
                <TableHead>Rating</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead><span className="sr-only">Open</span></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {reviews.map(review => (
                  <TableRow key={review.review_id}>
                    <TableCell className="max-w-sm">
                      <p className="line-clamp-2 text-sm">{review.comment || <span className="text-muted-foreground">No written comment</span>}</p>
                      {review.flag_reason && <p className="mt-1 flex items-center gap-1 text-xs text-destructive"><Flag className="h-3 w-3" /> {review.flag_reason}</p>}
                    </TableCell>
                    <TableCell><p className="font-medium">{review.target_title}</p>{review.vendor_name && <p className="text-xs text-muted-foreground">{review.vendor_name}</p>}</TableCell>
                    <TableCell>{review.university_name || <span className="text-muted-foreground">Platform-wide</span>}</TableCell>
                    <TableCell><span className="inline-flex items-center gap-1" aria-label={`${review.rating} out of 5 stars`}>{review.rating}<Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" /></span></TableCell>
                    <TableCell><Badge variant={review.moderation_status === 'published' ? 'default' : review.moderation_status === 'removed' ? 'destructive' : 'outline'}>{review.moderation_status.replace('_', ' ')}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap">{new Date(review.created_at).toLocaleDateString('en-GH')}</TableCell>
                    <TableCell><Button variant="outline" size="sm" onClick={() => { setSelected(review); setConfirmation(null); setReason(''); }}>Review</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <nav className="flex items-center justify-between" aria-label="Review queue pages">
        <p className="text-sm text-muted-foreground">Page {pageNumber} of {pageCount}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
          <Button variant="outline" size="sm" disabled={loading || offset + PAGE_SIZE >= total} onClick={() => setOffset(value => value + PAGE_SIZE)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
        </div>
      </nav>

      <Dialog open={!!selected} onOpenChange={open => { if (!open) closeReview(); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{confirmation ? 'Confirm review moderation' : 'Review details'}</DialogTitle>
            <DialogDescription>{confirmation ? 'This action changes review visibility and is recorded in the audit log.' : 'Review the content and choose a documented moderation action.'}</DialogDescription>
          </DialogHeader>
          {selected && !confirmation && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm">
                <div><dt className="text-muted-foreground">Target</dt><dd className="font-medium">{selected.target_title}</dd></div>
                <div><dt className="text-muted-foreground">Vendor</dt><dd>{selected.vendor_name || '—'}</dd></div>
                <div><dt className="text-muted-foreground">University</dt><dd>{selected.university_name || 'Platform-wide'}</dd></div>
                <div><dt className="text-muted-foreground">Rating</dt><dd>{selected.rating} / 5</dd></div>
                <div><dt className="text-muted-foreground">Current status</dt><dd>{selected.moderation_status.replace('_', ' ')}</dd></div>
                <div><dt className="text-muted-foreground">Submitted</dt><dd>{new Date(selected.created_at).toLocaleString('en-GH')}</dd></div>
              </dl>
              <div className="max-h-40 overflow-y-auto rounded-md bg-muted/50 p-3 text-sm">{selected.comment || 'No written comment.'}</div>
              {selected.flag_reason && <p className="text-sm text-destructive"><span className="font-medium">Flag reason:</span> {selected.flag_reason}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                {selected.moderation_status !== 'published' && <Button onClick={() => setConfirmation('published')}><Check className="mr-2 h-4 w-4" />Publish</Button>}
                {selected.moderation_status !== 'hidden' && <Button variant="outline" onClick={() => setConfirmation('hidden')}><EyeOff className="mr-2 h-4 w-4" />Hide</Button>}
                {selected.moderation_status !== 'removed' && <Button variant="destructive" onClick={() => setConfirmation('removed')}><Trash2 className="mr-2 h-4 w-4" />Remove</Button>}
              </div>
            </div>
          )}
          {selected && confirmation && (
            <div className="space-y-4">
              <p className="text-sm">{confirmation === 'published' ? 'Publishing makes this review eligible for public display and reputation aggregation.' : confirmation === 'hidden' ? 'Hiding removes this review from public display and reputation aggregation.' : 'Marking this review removed excludes it from public display and reputation aggregation.'}</p>
              <div className="space-y-2">
                <Label htmlFor="moderation-reason">Reason {confirmation === 'published' ? '(optional)' : '(required, 10–500 characters)'}</Label>
                <Textarea id="moderation-reason" value={reason} minLength={confirmation === 'published' ? undefined : 10} maxLength={500} onChange={event => setReason(event.target.value)} rows={3} />
              </div>
              <DialogFooter>
                <Button variant="outline" disabled={saving} onClick={() => setConfirmation(null)}>Back</Button>
                <Button variant={confirmation === 'removed' ? 'destructive' : 'default'} disabled={saving || (confirmation !== 'published' && (reason.trim().length < 10 || reason.trim().length > 500))} onClick={() => void confirmModeration()}>
                  {saving ? 'Saving…' : 'Confirm'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
