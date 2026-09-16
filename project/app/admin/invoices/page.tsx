'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAdminInvoices, exportToCsv } from '@/lib/data/payment-client';
import type { AdminInvoice } from '@/lib/types/payment';
import { INVOICE_STATUSES } from '@/lib/types/payment';
import { Receipt, Download, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AdminInvoicesPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('all');
  const pageSize = 20;

  useEffect(() => { loadInvoices(); }, [page, filter]);

  async function loadInvoices() {
    setLoading(true);
    const { invoices, total } = await getAdminInvoices({ status: filter, limit: pageSize, offset: page * pageSize });
    setInvoices(invoices);
    setTotal(total);
    setLoading(false);
  }

  const handleExport = () => {
    exportToCsv(invoices.map(inv => ({
      number: inv.invoice_number, user: inv.user?.full_name || inv.user?.email || '',
      vendor: inv.vendor?.business_name || '', type: inv.invoice_type,
      amount: inv.total_amount, status: inv.status, date: inv.created_at,
    })), 'invoices');
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" /> Invoices
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} invoices</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Export</Button>
      </div>

      <Tabs value={filter} onValueChange={v => { setFilter(v); setPage(0); }}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="issued">Issued</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="void">Void</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : invoices.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No invoices found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                    <TableCell className="text-sm">{inv.user?.full_name || inv.user?.email || '—'}</TableCell>
                    <TableCell className="text-sm">{inv.vendor?.business_name || '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{inv.invoice_type}</Badge></TableCell>
                    <TableCell className="font-medium">GH₵{inv.total_amount.toFixed(2)}</TableCell>
                    <TableCell><Badge className={INVOICE_STATUSES[inv.status as keyof typeof INVOICE_STATUSES]?.color || 'bg-muted text-muted-foreground'}>{INVOICE_STATUSES[inv.status as keyof typeof INVOICE_STATUSES]?.label || inv.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleDateString('en-GH')}</TableCell>
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
    </div>
  );
}
