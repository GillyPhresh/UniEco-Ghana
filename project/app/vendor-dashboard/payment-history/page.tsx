'use client';

import { useState, useEffect } from 'react';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getUserPayments, exportToCsv } from '@/lib/data/payment-client';
import type { PaymentRecord } from '@/lib/types/payment';
import { PAYMENT_STATUSES } from '@/lib/types/payment';
import { Button } from '@/components/ui/button';
import { Download, Wallet, Search } from 'lucide-react';

export default function PaymentHistoryPage() {
  return (
    <VendorRouteGuard><Content /></VendorRouteGuard>
  );
}

function Content() {
  const { vendor } = useVendor();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { loadPayments(); }, [search, statusFilter]);

  async function loadPayments() {
    setLoading(true);
    const { payments } = await getUserPayments({ limit: 50, search: search || undefined, status: statusFilter });
    setPayments(payments);
    setLoading(false);
  }

  const handleExport = () => {
    exportToCsv(payments.map(p => ({
      reference: p.payment_reference || '',
      provider: p.provider,
      type: p.payment_type,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      date: p.created_at,
    })), 'payment_history');
  };

  return (
    <VendorDashboardLayout vendorName={vendor?.business_name || ''} isVerified={vendor?.is_verified || false} subscriptionStatus={'none'}>
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Payment History
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{payments.length} transactions</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Export</Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by reference..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="success">Successful</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : payments.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No payments yet</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.payment_reference || '—'}</TableCell>
                    <TableCell className="text-sm capitalize">{p.provider}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{p.payment_type}</Badge></TableCell>
                    <TableCell className="font-medium">GH₵{p.amount.toFixed(2)}</TableCell>
                    <TableCell><Badge className={PAYMENT_STATUSES[p.status as keyof typeof PAYMENT_STATUSES]?.color || 'bg-muted text-muted-foreground'}>{PAYMENT_STATUSES[p.status as keyof typeof PAYMENT_STATUSES]?.label || p.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString('en-GH')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
    </VendorDashboardLayout>
  );
}
