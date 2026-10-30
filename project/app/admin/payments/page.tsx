'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAdminPayments } from '@/lib/data/payment-client';
import { downloadAdminCsv } from '@/lib/data/admin-export-client';
import type { AdminPayment } from '@/lib/types/payment';
import { PAYMENT_STATUSES } from '@/lib/types/payment';
import { CreditCard, Download, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminPaymentsPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('all');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reconcilingReference, setReconcilingReference] = useState<string | null>(null);
  const pageSize = 20;

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getAdminPayments({ status: filter, limit: pageSize, offset: page * pageSize });
      setPayments(result.payments);
      setTotal(result.total);
    } catch {
      setPayments([]);
      setTotal(0);
      setLoadError('Unable to load payments. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => { void loadPayments(); }, [loadPayments]);

  const reconcilePayment = async (reference: string) => {
    setReconcilingReference(reference);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch('/api/admin/payments/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
        body: JSON.stringify({ reference }),
      });
      const body = await response.json() as { payment?: { status?: string }; error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to verify this payment.');
      toast.success(body.payment?.status === 'success' ? 'Payment confirmed and dashboard updated.' : 'Payment status refreshed.');
      await loadPayments();
    } catch (error) {
      toast.error(error instanceof Error && error.name === 'AbortError'
        ? 'Verification timed out. Please try again.'
        : error instanceof Error ? error.message : 'Unable to verify this payment.');
    } finally {
      clearTimeout(timeout);
      setReconcilingReference(null);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadAdminCsv('payments', filter);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create payment export.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" /> Payments
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} transactions</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button variant="outline" size="sm" onClick={() => void loadPayments()} disabled={loading} className="flex-1 sm:flex-none">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || loading || !!loadError} className="flex-1 sm:flex-none">
          <Download className="mr-2 h-4 w-4" /> {exporting ? 'Preparing…' : 'Export'}
        </Button>
      </div>

      </div>

      <Tabs value={filter} onValueChange={v => { setFilter(v); setPage(0); }}>
        <TabsList className="flex h-auto w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="success">Successful</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="initiated">Initiated</TabsTrigger>
          <TabsTrigger value="reconciliation_required">Needs review</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="refunded">Refunded</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : loadError ? (
            <div className="py-8 text-center space-y-3">
              <p role="alert" className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void loadPayments()}>Retry</Button>
            </div>
          ) : payments.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No payments found</div>
          ) : (
            <>
            <div className="space-y-3 p-3 lg:hidden" aria-label="Mobile payments list">
              {payments.map(p => <article key={p.id} className="rounded-xl border border-border bg-background p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-mono text-sm font-medium">{p.payment_reference || 'Payment reference unavailable'}</p><p className="mt-1 break-words text-sm">{p.user?.full_name || p.user?.email || 'User unavailable'}</p></div><Badge className="shrink-0">{PAYMENT_STATUSES[p.status as keyof typeof PAYMENT_STATUSES]?.label || p.status}</Badge></div>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm"><div><dt className="text-xs text-muted-foreground">Amount</dt><dd className="mt-0.5 font-semibold">GH₵{p.amount.toFixed(2)}</dd></div><div><dt className="text-xs text-muted-foreground">Provider</dt><dd className="mt-0.5 capitalize">{p.provider}</dd></div><div><dt className="text-xs text-muted-foreground">Type</dt><dd className="mt-0.5 capitalize">{p.payment_type}</dd></div><div><dt className="text-xs text-muted-foreground">Date</dt><dd className="mt-0.5 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString('en-GH')}</dd></div></dl>
                {p.provider === 'paystack' && ['pending', 'initiated', 'reconciliation_required'].includes(p.status) && p.payment_reference && <Button variant="outline" size="sm" className="mt-4 min-h-10 w-full" disabled={reconcilingReference === p.payment_reference} onClick={() => void reconcilePayment(p.payment_reference!)}><RefreshCw className={`mr-2 h-4 w-4 ${reconcilingReference === p.payment_reference ? 'animate-spin' : ''}`} />{reconcilingReference === p.payment_reference ? 'Checking Paystack…' : 'Verify payment status'}</Button>}
              </article>)}
            </div>
            <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.payment_reference || '—'}</TableCell>
                    <TableCell className="text-sm">{p.user?.full_name || p.user?.email || '—'}</TableCell>
                    <TableCell className="text-sm capitalize">{p.provider}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{p.payment_type}</Badge></TableCell>
                    <TableCell className="font-medium">GH₵{p.amount.toFixed(2)}</TableCell>
                    <TableCell><Badge className={PAYMENT_STATUSES[p.status as keyof typeof PAYMENT_STATUSES]?.color || 'bg-muted text-muted-foreground'}>{PAYMENT_STATUSES[p.status as keyof typeof PAYMENT_STATUSES]?.label || p.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString('en-GH')}</TableCell>
                    <TableCell>{p.provider === 'paystack' && ['pending', 'initiated', 'reconciliation_required'].includes(p.status) && p.payment_reference ? <Button variant="ghost" size="sm" disabled={reconcilingReference === p.payment_reference} onClick={() => void reconcilePayment(p.payment_reference!)}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${reconcilingReference === p.payment_reference ? 'animate-spin' : ''}`} />Verify</Button> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
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
    </div>
  );
}
