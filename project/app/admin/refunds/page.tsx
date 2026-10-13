'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { getAdminRefunds, approveRefund, rejectRefund } from '@/lib/data/payment-client';
import type { AdminRefund } from '@/lib/types/payment';
import { REFUND_STATUSES } from '@/lib/types/payment';
import { RotateCcw, ChevronLeft, ChevronRight, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminRefundsPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [refunds, setRefunds] = useState<AdminRefund[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<AdminRefund | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pageSize = 20;

  const loadRefunds = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getAdminRefunds({ status: filter, limit: pageSize, offset: page * pageSize });
      setRefunds(result.refunds);
      setTotal(result.total);
    } catch {
      setRefunds([]);
      setTotal(0);
      setLoadError('Unable to load refunds. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => { void loadRefunds(); }, [loadRefunds]);

  function openAction(r: AdminRefund, a: 'approve' | 'reject') {
    setSelected(r);
    setAction(a);
    setNotes('');
  }

  const handleAction = async () => {
    if (!selected || !action || notes.trim().length < 10) return;
    setProcessing(true);
    try {
      const result = action === 'approve'
        ? await approveRefund(selected.id, notes)
        : await rejectRefund(selected.id, notes);
      if (result.error) { toast.error(result.error); }
      else {
        toast.success(`Refund ${action === 'approve' ? 'approved' : 'rejected'}`);
        setSelected(null);
        setAction(null);
        void loadRefunds();
      }
    } catch {
      toast.error('Unable to review this refund. Please retry.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <RotateCcw className="h-6 w-6 text-primary" /> Refund Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{total} refund requests</p>
      </div>

      <Tabs value={filter} onValueChange={v => { setFilter(v); setPage(0); }}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="requested">Requested</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="processed">Processed</TabsTrigger>
        </TabsList>
      </Tabs>

      <p role="status" className="text-sm text-muted-foreground">
        Refund approval and rejection are available. Provider refund execution is not configured; approved refunds cannot be marked processed here.
      </p>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : loadError ? (
            <div className="py-8 text-center space-y-3">
              <p role="alert" className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void loadRefunds()}>Retry</Button>
            </div>
          ) : refunds.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No refund requests</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Refund #</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refunds.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.refund_number || '—'}</TableCell>
                    <TableCell className="text-sm">{r.user?.full_name || r.user?.email || '—'}</TableCell>
                    <TableCell className="font-medium">GH₵{r.amount.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-32 truncate">{r.reason || '—'}</TableCell>
                    <TableCell><Badge className={REFUND_STATUSES[r.status as keyof typeof REFUND_STATUSES]?.color || 'bg-muted text-muted-foreground'}>{REFUND_STATUSES[r.status as keyof typeof REFUND_STATUSES]?.label || r.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('en-GH')}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {r.status === 'requested' && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-success" onClick={() => openAction(r, 'approve')}><Check className="h-3 w-3 mr-1" /> Approve</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => openAction(r, 'reject')}><X className="h-3 w-3 mr-1" /> Reject</Button>
                          </>
                        )}
                        {r.status === 'approved' && (
                          <span className="text-xs text-muted-foreground">Awaiting provider workflow</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(total / pageSize)}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Action dialog */}
      <Dialog open={!!selected} onOpenChange={v => { if (!v) { setSelected(null); setAction(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Approve Refund' : 'Reject Refund'}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-border p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Refund #</span><span className="font-mono">{selected.refund_number}</span></div>
                <div className="flex justify-between mt-1"><span className="text-muted-foreground">Amount</span><span className="font-medium">GH₵{selected.amount.toFixed(2)}</span></div>
                <div className="flex justify-between mt-1"><span className="text-muted-foreground">User</span><span>{selected.user?.full_name || selected.user?.email}</span></div>
                {selected.reason && <div className="mt-2 pt-2 border-t border-border"><span className="text-muted-foreground">Reason: </span><span>{selected.reason}</span></div>}
              </div>
              <div className="space-y-1.5">
                <Label>Review reason (required, at least 10 characters)</Label>
                <Textarea maxLength={500} placeholder="Explain this refund decision..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelected(null); setAction(null); }}>Cancel</Button>
            <Button
              disabled={processing || notes.trim().length < 10}
              onClick={handleAction}
              variant={action === 'reject' ? 'destructive' : 'default'}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
