'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/auth-context';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getVendorVerifications, approveVendor, rejectVendor, suspendVendor, restoreVendor } from '@/lib/data/admin-client';
import type { VendorVerificationQueueItem } from '@/lib/types/admin';
import { Check, X, Store, Ban, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export default function VendorVerificationPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const canManageVendors = isSuperAdmin || user?.role === 'university_admin';
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<VendorVerificationQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('unverified');
  const [selected, setSelected] = useState<VendorVerificationQueueItem | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingStatusAction, setPendingStatusAction] = useState<'approve' | 'reject' | 'suspend' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadVendors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getVendorVerifications({ status: filter, limit: 30 });
      setVendors(result.vendors);
      setTotal(result.total);
    } catch {
      setVendors([]);
      setTotal(0);
      setError('Unable to load vendor verifications. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void loadVendors(); }, [loadVendors]);

  const requestStatusAction = (action: NonNullable<typeof pendingStatusAction>) => {
    if (!selected || reason.trim().length < 10 || reason.trim().length > 500) return;
    setPendingStatusAction(action);
  };

  const confirmStatusAction = async () => {
    if (!selected || !pendingStatusAction) return;
    const action = pendingStatusAction;
    setActionLoading(true);
    try {
      const result = action === 'approve'
        ? await approveVendor(selected.id, reason.trim())
        : action === 'reject'
          ? await rejectVendor(selected.id, reason.trim())
        : action === 'suspend'
          ? await suspendVendor(selected.id, reason.trim())
          : await restoreVendor(selected.id, reason.trim());
      if (result.error) toast.error(result.error);
      else {
        toast.success(action === 'approve' ? 'Vendor approved' : action === 'reject' ? 'Vendor rejected' : action === 'suspend' ? 'Vendor suspended' : 'Vendor restored');
        setSelected(null);
        setRejectMode(false);
        setReason('');
        void loadVendors();
      }
    } catch {
      toast.error('Unable to complete this vendor action. Please retry.');
    } finally {
      setPendingStatusAction(null);
      setActionLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Store className="h-6 w-6 text-primary" /> Vendor Verification Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{total} vendors{user?.role === 'university_admin' ? ' in your assigned university scope' : ''}</p>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="unverified">Unverified</TabsTrigger>
          <TabsTrigger value="verified">Verified</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : error ? (
        <Card><CardContent className="space-y-3 py-12 text-center text-sm text-muted-foreground"><p>{error}</p><Button variant="outline" size="sm" onClick={loadVendors}>Retry</Button></CardContent></Card>
      ) : vendors.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No vendors found</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {vendors.map(v => (
              <Card key={v.id} className="cursor-pointer hover:border-primary/30 transition-colors">
              <CardContent className="flex items-center gap-3 p-4" onClick={() => { setSelected(v); setRejectMode(false); setReason(''); }}>
                <div className="h-10 w-10 overflow-hidden rounded-full bg-primary/10 flex items-center justify-center">
                  {v.logo_url ? <img src={v.logo_url} alt="" className="h-full w-full object-cover" /> : <Store className="h-5 w-5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{v.business_name}</p>
                  <p className="text-xs text-muted-foreground">{v.business_type || 'No category'} | {v.owner?.full_name || v.owner?.email || 'Unknown owner'}</p>
                </div>
                <div className="flex gap-1.5">
                  {v.is_verified && <Badge className="bg-success/10 text-success">Verified</Badge>}
                  {!v.is_active && <Badge className="bg-destructive/10 text-destructive">Suspended</Badge>}
                  {v.is_student_business && <Badge variant="outline">Student</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={open => { if (!open) { setSelected(null); setRejectMode(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Vendor Review</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Business:</span> {selected.business_name}</p>
                <p><span className="text-muted-foreground">Category:</span> {selected.business_type || '—'}</p>
                <p><span className="text-muted-foreground">Owner:</span> {selected.owner?.full_name || '—'}</p>
                <p><span className="text-muted-foreground">Email:</span> {selected.owner?.email || '—'}</p>
                <p><span className="text-muted-foreground">Phone:</span> {selected.contact_phone || '—'}</p>
                <p><span className="text-muted-foreground">University:</span> {selected.university?.name || '—'}</p>
                <p><span className="text-muted-foreground">Rating:</span> {selected.rating_avg.toFixed(1)} ({selected.rating_count} reviews)</p>
                <p><span className="text-muted-foreground">Student business:</span> {selected.is_student_business ? 'Yes' : 'No'}</p>
              </div>

              {rejectMode ? (
                <div className="space-y-3">
                  <Textarea rows={3} minLength={10} maxLength={500} placeholder="Reason for rejection or verification revocation (10–500 characters)..." value={reason} onChange={e => setReason(e.target.value)} aria-label="Vendor verification decision reason" />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setRejectMode(false)}>Cancel</Button>
                    <Button variant="destructive" className="flex-1" disabled={actionLoading || reason.trim().length < 10 || reason.trim().length > 500} onClick={() => requestStatusAction('reject')}>
                      <X className="mr-2 h-4 w-4" /> Review rejection
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Textarea rows={3} maxLength={500} minLength={10} placeholder="Reason for verification decision or status change (10–500 characters)..." value={reason} onChange={event => setReason(event.target.value)} aria-label="Vendor verification decision reason" />
                  <div className="flex gap-2">
                  {!selected.is_verified && (
                    <Button className="flex-1" disabled={actionLoading || reason.trim().length < 10 || reason.trim().length > 500} onClick={() => requestStatusAction('approve')}>
                      <Check className="mr-2 h-4 w-4" /> Approve
                    </Button>
                  )}
                  {selected.is_verified && (
                    <Button variant="outline" className="flex-1 text-destructive" disabled={actionLoading} onClick={() => setRejectMode(true)}>
                      <X className="mr-2 h-4 w-4" /> Revoke
                    </Button>
                  )}
                  {canManageVendors && (selected.is_active ? (
                    <Button variant="outline" className="flex-1 text-destructive" disabled={actionLoading || reason.trim().length < 10} onClick={() => requestStatusAction('suspend')}>
                      <Ban className="mr-2 h-4 w-4" /> Suspend
                    </Button>
                  ) : (
                    <Button variant="outline" className="flex-1" disabled={actionLoading || reason.trim().length < 10} onClick={() => requestStatusAction('restore')}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Restore
                    </Button>
                  ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingStatusAction !== null} onOpenChange={open => { if (!open && !actionLoading) setPendingStatusAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm vendor {pendingStatusAction === 'approve' ? 'approval' : pendingStatusAction === 'reject' ? (selected?.is_verified ? 'verification revocation' : 'rejection') : pendingStatusAction === 'suspend' ? 'suspension' : 'restoration'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatusAction === 'approve'
                ? `Approve ${selected?.business_name || 'this vendor'} for verification? This decision will be recorded with your reason.`
                : pendingStatusAction === 'reject'
                  ? selected?.is_verified
                    ? `Revoke verification for ${selected.business_name}? This decision and your reason will be recorded.`
                    : `Reject ${selected?.business_name || 'this vendor'}'s verification request? This decision and your reason will be recorded.`
                  : `${pendingStatusAction === 'suspend' ? 'Suspend' : 'Restore'} ${selected?.business_name || 'this vendor'}? Marketplace availability may change. This decision will be audited.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={actionLoading} onClick={event => { event.preventDefault(); void confirmStatusAction(); }}>
              {actionLoading ? 'Saving…' : pendingStatusAction === 'approve' ? 'Confirm approval' : pendingStatusAction === 'reject' ? (selected?.is_verified ? 'Confirm revocation' : 'Confirm rejection') : pendingStatusAction === 'suspend' ? 'Confirm suspension' : 'Confirm restoration'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
