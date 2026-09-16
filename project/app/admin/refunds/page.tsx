'use client';

import { useState, useEffect } from 'react';
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
import { getAdminRefunds, approveRefund, rejectRefund, processRefund } from '@/lib/data/payment-client';
import { useAuth } from '@/lib/auth/auth-context';
import type { Refund } from '@/lib/types/payment';
import { REFUND_STATUSES } from '@/lib/types/payment';
import { RotateCcw, ChevronLeft, ChevronRight, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminRefundsPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Refund | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | 'process' | null>(null);
  const [notes, setNotes] = useState('');
  const [providerRef, setProviderRef] = useState('');
  const [processing, setProcessing] = useState(false);
  const pageSize = 20;

  useEffect(() => { loadRefunds(); }, [page, filter]);

  async function loadRefunds() {
    setLoading(true);
    const { refunds, total } = await getAdminRefunds({ status: filter, limit: pageSize, offset: page * pageSize });
    setRefunds(refunds);
    setTotal(total);
    setLoading(false);
  }

  function openAction(r: Refund, a: 'approve' | 'reject' | 'process') {
    setSelected(r);
    setAction(a);
    setNotes('');
    setProviderRef('');
  }

  const handleAction = async () => {
    if (!selected || !action || !user?.id) return;
    setProcessing(true);
    let result: { error: string | null };
    if (action === 'approve') result = await approveRefund(selected.id, user.id, notes);
    else if (action === 'reject') result = await rejectRefund(selected.id, user.id, notes);
    else result = await processRefund(selected.id, providerRef);

    if (result.error) { toast.error(result.error); }
    else {
      toast.success(`Refund ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'processed'}`);
      setSelected(null);
      setAction(null);
      loadRefunds();
    }
    setProcessing(false);
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

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
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
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-primary" onClick={() => openAction(r, 'process')}>Process</Button>
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
              {action === 'approve' ? 'Approve Refund' : action === 'reject' ? 'Reject Refund' : 'Process Refund'}
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
              {action === 'process' && (
                <div className="space-y-1.5">
                  <Label>Provider Reference</Label>
                  <Textarea placeholder="Enter provider refund reference..." value={providerRef} onChange={e => setProviderRef(e.target.value)} rows={2} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Notes {action !== 'process' && '(optional)'}</Label>
                <Textarea placeholder="Add notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelected(null); setAction(null); }}>Cancel</Button>
            <Button
              disabled={processing || (action === 'process' && !providerRef)}
              onClick={handleAction}
              variant={action === 'reject' ? 'destructive' : 'default'}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : action === 'approve' ? 'Approve' : action === 'reject' ? 'Reject' : 'Process'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
