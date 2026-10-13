'use client';

import { useState, useEffect } from 'react';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getUserInvoices, printInvoice } from '@/lib/data/payment-client';
import type { Invoice } from '@/lib/types/payment';
import { INVOICE_STATUSES } from '@/lib/types/payment';
import { FileText, Download, Printer, Receipt } from 'lucide-react';

export default function InvoicesPage() {
  return (
    <VendorRouteGuard><Content /></VendorRouteGuard>
  );
}

function Content() {
  const { vendor } = useVendor();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => { loadInvoices(); }, []);

  async function loadInvoices() {
    setLoading(true);
    const data = await getUserInvoices();
    setInvoices(data);
    setLoading(false);
  }

  return (
    <VendorDashboardLayout vendorName={vendor?.business_name || ''} isVerified={vendor?.is_verified || false} subscriptionStatus={'none'}>
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Receipt className="h-6 w-6 text-primary" /> Invoices
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{invoices.length} invoices</p>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : invoices.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No invoices yet. Subscribe to a plan to generate invoices.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{inv.invoice_type}</Badge></TableCell>
                    <TableCell className="font-medium">GH₵{inv.total_amount.toFixed(2)}</TableCell>
                    <TableCell><Badge className={INVOICE_STATUSES[inv.status as keyof typeof INVOICE_STATUSES]?.color || 'bg-muted text-muted-foreground'}>{INVOICE_STATUSES[inv.status as keyof typeof INVOICE_STATUSES]?.label || inv.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleDateString('en-GH')}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => printInvoice(inv)}>
                        <Printer className="h-3.5 w-3.5 mr-1" /> Print
                      </Button>
                    </TableCell>
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
