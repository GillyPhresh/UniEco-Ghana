'use client';

import { useCallback, useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAdminAdvertisements, approveAdvertisement, rejectAdvertisement } from '@/lib/data/admin-client';
import type { AdminAdvertisement } from '@/lib/types/admin';
import { Megaphone, Check, X, Star, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminAdvertisementsPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [ads, setAds] = useState<AdminAdvertisement[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<AdminAdvertisement | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState(0);
  const [featured, setFeatured] = useState(false);
  const [sponsored, setSponsored] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<'approved' | 'rejected' | null>(null);

  const loadAds = useCallback(async () => {
    setLoading(true);
    const { ads, total } = await getAdminAdvertisements({ status: filter, limit: 30 });
    setAds(ads);
    setTotal(total);
    setLoading(false);
  }, [filter]);

  useEffect(() => { void loadAds(); }, [loadAds]);

  function openApprove(ad: AdminAdvertisement) {
    setSelected(ad);
    setRejectMode(false);
    setReason('');
    setPriority(ad.priority || 0);
    setFeatured(ad.is_featured || false);
    setSponsored(ad.is_sponsored || false);
  }

  const requestDecision = (decision: 'approved' | 'rejected') => {
    if (!selected || reason.trim().length < 10 || reason.trim().length > 500) { toast.error('Please provide a reason between 10 and 500 characters'); return; }
    setPendingDecision(decision);
  };

  const confirmDecision = async () => {
    if (!selected || reason.trim().length < 10 || reason.trim().length > 500) { toast.error('Please provide a reason between 10 and 500 characters'); return; }
    setActionLoading(true);
    try {
      const result = pendingDecision === 'approved'
        ? await approveAdvertisement(selected.id, priority, featured, sponsored, reason)
        : await rejectAdvertisement(selected.id, reason);
      if (result.error) { toast.error(result.error); }
      else {
        toast.success(pendingDecision === 'approved' ? 'Advertisement approved' : 'Advertisement rejected');
        setPendingDecision(null);
        setRejectMode(false);
        setSelected(null);
        setReason('');
        void loadAds();
      }
    } catch {
      toast.error('Unable to complete this advertisement review. Please retry.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" /> Advertisement Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{total} advertisements</p>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : ads.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No advertisements found</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {ads.map(ad => (
            <Card key={ad.id} className="cursor-pointer hover:border-primary/30 transition-colors">
              <CardContent className="flex items-center gap-3 p-4" onClick={() => openApprove(ad)}>
                {ad.image_url ? (
                  <img src={ad.image_url || ''} alt={ad.title || ''} className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted"><Megaphone className="h-6 w-6 text-muted-foreground/40" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{ad.title || 'Untitled'}</p>
                  <p className="text-xs text-muted-foreground">{ad.vendor?.business_name || ad.university?.name || 'Platform'} | {ad.placement || '—'}</p>
                  <p className="text-xs text-muted-foreground">{ad.starts_at ? new Date(ad.starts_at).toLocaleDateString('en-GH') : '—'} → {ad.ends_at ? new Date(ad.ends_at).toLocaleDateString('en-GH') : '—'}</p>
                </div>
                <div className="flex gap-1.5">
                  <Badge className={ad.status === 'approved' ? 'bg-success/10 text-success' : ad.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}>{ad.status}</Badge>
                  {ad.is_featured && <Badge variant="outline"><Star className="h-3 w-3 mr-0.5" /> Featured</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={open => { if (!open) { setSelected(null); setRejectMode(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Review Advertisement</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Title:</span> {selected.title}</p>
                <p><span className="text-muted-foreground">Vendor:</span> {selected.vendor?.business_name || '—'}</p>
                <p><span className="text-muted-foreground">Placement:</span> {selected.placement || '—'}</p>
                <p><span className="text-muted-foreground">Target URL:</span> {selected.target_url ?? '—'}</p>
                <p><span className="text-muted-foreground">Duration:</span> {selected.starts_at ? new Date(selected.starts_at).toLocaleDateString('en-GH') : '—'} → {selected.ends_at ? new Date(selected.ends_at).toLocaleDateString('en-GH') : '—'}</p>
              </div>

              {rejectMode ? (
                <div className="space-y-3">
                  <Input aria-label="Reason for rejection" placeholder="Reason for rejection..." value={reason} minLength={10} maxLength={500} onChange={e => setReason(e.target.value)} />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setRejectMode(false)}>Cancel</Button>
                    <Button variant="destructive" className="flex-1" disabled={actionLoading || reason.trim().length < 10 || reason.trim().length > 500} onClick={() => requestDecision('rejected')}><X className="mr-2 h-4 w-4" /> Review rejection</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="space-y-1.5"><Label>Priority (higher shows first)</Label><Input type="number" min={0} max={100} value={priority} onChange={e => setPriority(Number(e.target.value))} /></div>
                    <div className="space-y-1.5"><Label htmlFor="advertisement-review-reason">Review reason (required, 10–500 characters)</Label><Input id="advertisement-review-reason" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} /> Featured</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sponsored} onChange={e => setSponsored(e.target.checked)} /> Sponsored</label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" disabled={actionLoading || !Number.isInteger(priority) || priority < 0 || priority > 100 || reason.trim().length < 10 || reason.trim().length > 500} onClick={() => requestDecision('approved')}><Check className="mr-2 h-4 w-4" /> Review approval</Button>
                    <Button variant="outline" className="flex-1 text-destructive" disabled={actionLoading} onClick={() => setRejectMode(true)}><X className="mr-2 h-4 w-4" /> Reject</Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingDecision !== null} onOpenChange={open => { if (!open && !actionLoading) setPendingDecision(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDecision === 'approved' ? 'Confirm advertisement approval' : 'Confirm advertisement rejection'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDecision === 'approved'
                ? `Approve “${selected?.title || 'this advertisement'}” with priority ${priority}; ${featured ? 'Featured' : 'not Featured'} and ${sponsored ? 'Sponsored' : 'not Sponsored'} classification?`
                : `Reject “${selected?.title || 'this advertisement'}”? It will not be eligible for display.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">Reason: {reason.trim()}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={actionLoading || reason.trim().length < 10 || reason.trim().length > 500} onClick={event => { event.preventDefault(); void confirmDecision(); }}>
              {actionLoading ? 'Saving…' : pendingDecision === 'approved' ? 'Confirm approval' : 'Confirm rejection'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
