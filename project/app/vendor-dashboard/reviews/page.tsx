'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import { getVendorReviews, respondToReview, reportReview } from '@/lib/data/vendor-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RatingStars } from '@/components/shared/rating-stars';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import type { ReviewWithResponse } from '@/lib/types/vendor';
import {
  Star, MessageSquare, Send, Flag, Loader2, Check, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

export default function ReviewsPage() {
  return (
    <VendorRouteGuard>
      <SiteHeader />
      <ReviewsContent />
      <SiteFooter />
    </VendorRouteGuard>
  );
}

function ReviewsContent() {
  const { vendor, loading } = useVendor();
  const [reviews, setReviews] = useState<ReviewWithResponse[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<ReviewWithResponse | null>(null);
  const [responseBody, setResponseBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState<ReviewWithResponse | null>(null);
  const [reportReason, setReportReason] = useState('');

  useEffect(() => {
    if (!vendor) return;
    loadReviews();
  }, [vendor]);

  async function loadReviews() {
    if (!vendor) return;
    setDataLoading(true);
    const data = await getVendorReviews(vendor.id);
    setReviews(data);
    setDataLoading(false);
  }

  const handleRespond = async () => {
    if (!vendor || !respondingTo || !responseBody.trim()) return;
    setSaving(true);
    const { error } = await respondToReview(respondingTo.id, vendor.id, responseBody.trim());
    if (error) { toast.error(error); }
    else {
      toast.success('Response posted');
      setRespondingTo(null);
      setResponseBody('');
      loadReviews();
    }
    setSaving(false);
  };

  const handleReport = async () => {
    if (!reporting || !reportReason.trim()) return;
    const { error } = await reportReview(reporting.id, reportReason.trim());
    if (error) { toast.error(error); }
    else {
      toast.success('Review reported. Our team will review it.');
      setReporting(null);
      setReportReason('');
    }
  };

  if (loading) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </VendorDashboardLayout>
    );
  }

  const avgRating = vendor?.rating_avg || 0;
  const totalReviews = vendor?.rating_count || 0;
  const respondedReviews = reviews.filter(r => r.response).length;
  const pendingReviews = reviews.filter(r => !r.response).length;

  return (
    <VendorDashboardLayout
      vendorName={vendor?.business_name || ''}
      isVerified={vendor?.is_verified || false}
      subscriptionStatus=""
    >
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">View and respond to customer reviews. You cannot edit or delete customer reviews.</p>
      </div>

      {/* Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
              <Star className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{avgRating > 0 ? avgRating.toFixed(1) : '—'}</p>
              <p className="text-xs text-muted-foreground">{totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
              <Check className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{respondedReviews}</p>
              <p className="text-xs text-muted-foreground">Responded</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <MessageSquare className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{pendingReviews}</p>
              <p className="text-xs text-muted-foreground">Awaiting response</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reviews list */}
      {dataLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Star className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-foreground">No reviews yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Reviews from students will appear here once you start getting them.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map(review => (
            <Card key={review.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={review.reviewer?.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {review.reviewer?.full_name?.charAt(0).toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{review.reviewer?.full_name || 'Anonymous'}</p>
                      <span className="text-xs text-muted-foreground">
                        {new Date(review.created_at).toLocaleDateString('en-GH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="mt-1">
                      <RatingStars rating={Number(review.rating)} size={14} showValue={false} />
                    </div>
                    {review.comment && (
                      <p className="mt-2 text-sm text-foreground">{review.comment}</p>
                    )}

                    {/* Vendor response */}
                    {review.response ? (
                      <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5 text-primary" />
                          <p className="text-xs font-semibold text-primary">Your response</p>
                        </div>
                        <p className="mt-1.5 text-sm text-foreground">{review.response.response_body}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(review.response.created_at).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    ) : null}

                    {/* Actions */}
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setRespondingTo(review); setResponseBody(review.response?.response_body || ''); }}
                      >
                        <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                        {review.response ? 'Edit Response' : 'Respond'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => setReporting(review)}
                      >
                        <Flag className="mr-1.5 h-3.5 w-3.5" /> Report
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Respond dialog */}
      <Dialog open={!!respondingTo} onOpenChange={(open) => { if (!open) setRespondingTo(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{respondingTo?.response ? 'Edit Your Response' : 'Respond to Review'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {respondingTo && (
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <RatingStars rating={Number(respondingTo.rating)} size={14} showValue={false} />
                  <span className="text-xs text-muted-foreground">
                    by {respondingTo.reviewer?.full_name || 'Anonymous'}
                  </span>
                </div>
                {respondingTo.comment && <p className="mt-2 text-sm text-muted-foreground">{respondingTo.comment}</p>}
              </div>
            )}
            <div className="space-y-2">
              <Textarea
                rows={4}
                placeholder="Write a professional response to this review..."
                value={responseBody}
                onChange={e => setResponseBody(e.target.value)}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">{responseBody.length}/500 characters</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRespondingTo(null)}>Cancel</Button>
            <Button onClick={handleRespond} disabled={saving || !responseBody.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {saving ? 'Posting...' : 'Post Response'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report dialog */}
      <Dialog open={!!reporting} onOpenChange={(open) => { if (!open) setReporting(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report Review</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs text-foreground">
                Report reviews that are abusive, fake, or inappropriate. Our team will review your report. You cannot delete reviews yourself.
              </p>
            </div>
            <div className="space-y-2">
              <Textarea
                rows={3}
                placeholder="Why are you reporting this review?"
                value={reportReason}
                onChange={e => setReportReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReporting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReport} disabled={!reportReason.trim()}>
              <Flag className="mr-2 h-4 w-4" /> Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </VendorDashboardLayout>
  );
}
