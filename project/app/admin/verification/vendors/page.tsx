'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getVendorVerifications, approveVendor, rejectVendor, suspendVendor, restoreVendor } from '@/lib/data/admin-client';
import type { AdminVendor } from '@/lib/types/admin';
import { Check, X, Store, Ban, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export default function VendorVerificationPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('unverified');
  const [selected, setSelected] = useState<AdminVendor | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { loadVendors(); }, [filter]);

  async function loadVendors() {
    setLoading(true);
    const { vendors, total } = await getVendorVerifications({ status: filter, limit: 30 });
    setVendors(vendors);
    setTotal(total);
    setLoading(false);
  }

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    const { error } = await approveVendor(selected.id);
    if (error) { toast.error(error); } else { toast.success('Vendor approved'); setSelected(null); loadVendors(); }
    setActionLoading(false);
  };

  const handleReject = async () => {
    if (!selected || !reason.trim()) { toast.error('Please provide a reason'); return; }
    setActionLoading(true);
    const { error } = await rejectVendor(selected.id, reason);
    if (error) { toast.error(error); } else { toast.success('Vendor rejected'); setRejectMode(false); setSelected(null); setReason(''); loadVendors(); }
    setActionLoading(false);
  };

  const handleSuspend = async () => {
    if (!selected) return;
    setActionLoading(true);
    const { error } = await suspendVendor(selected.id, 'Suspended by admin');
    if (error) { toast.error(error); } else { toast.success('Vendor suspended'); setSelected(null); loadVendors(); }
    setActionLoading(false);
  };

  const handleRestore = async () => {
    if (!selected) return;
    setActionLoading(true);
    const { error } = await restoreVendor(selected.id);
    if (error) { toast.error(error); } else { toast.success('Vendor restored'); setSelected(null); loadVendors(); }
    setActionLoading(false);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Store className="h-6 w-6 text-primary" /> Vendor Verification Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{total} vendors</p>
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
      ) : vendors.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No vendors found</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {vendors.map(v => (
            <Card key={v.id} className="cursor-pointer hover:border-primary/30 transition-colors">
              <CardContent className="flex items-center gap-3 p-4" onClick={() => { setSelected(v); setRejectMode(false); }}>
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
                  <Textarea rows={3} placeholder="Reason for rejection..." value={reason} onChange={e => setReason(e.target.value)} />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setRejectMode(false)}>Cancel</Button>
                    <Button variant="destructive" className="flex-1" disabled={actionLoading || !reason.trim()} onClick={handleReject}>
                      <X className="mr-2 h-4 w-4" /> Confirm rejection
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  {!selected.is_verified && (
                    <Button className="flex-1" disabled={actionLoading} onClick={handleApprove}>
                      <Check className="mr-2 h-4 w-4" /> Approve
                    </Button>
                  )}
                  {selected.is_verified && (
                    <Button variant="outline" className="flex-1 text-destructive" disabled={actionLoading} onClick={() => setRejectMode(true)}>
                      <X className="mr-2 h-4 w-4" /> Revoke
                    </Button>
                  )}
                  {selected.is_active ? (
                    <Button variant="outline" className="flex-1 text-destructive" disabled={actionLoading} onClick={handleSuspend}>
                      <Ban className="mr-2 h-4 w-4" /> Suspend
                    </Button>
                  ) : (
                    <Button variant="outline" className="flex-1" disabled={actionLoading} onClick={handleRestore}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Restore
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
