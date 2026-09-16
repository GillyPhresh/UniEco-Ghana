'use client';

import { useState, useEffect } from 'react';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getVendorFinancialSummary } from '@/lib/data/payment-client';
import type { VendorFinancialSummary } from '@/lib/types/payment';
import { PAYMENT_STATUSES } from '@/lib/types/payment';
import { Wallet, TrendingUp, Calendar, CreditCard, Clock, CheckCircle } from 'lucide-react';

export default function VendorFinancialDashboardPage() {
  return (
    <VendorRouteGuard><Content /></VendorRouteGuard>
  );
}

function Content() {
  const { vendor } = useVendor();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<VendorFinancialSummary | null>(null);

  useEffect(() => {
    if (vendor?.id) loadData();
  }, [vendor?.id]);

  async function loadData() {
    setLoading(true);
    const data = await getVendorFinancialSummary(vendor!.id);
    setSummary(data);
    setLoading(false);
  }

  if (loading || !vendor) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <div className="p-6 space-y-4 max-w-4xl">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </VendorDashboardLayout>
    );
  }

  const sub = summary?.subscription;
  const isSubActive = sub?.status === 'active';

  return (
    <VendorDashboardLayout vendorName={vendor.business_name || ''} isVerified={vendor.is_verified || false} subscriptionStatus={sub?.status || 'none'}>
      <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Financial Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Your subscription and payment overview</p>
        </div>

        {/* Summary cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <CreditCard className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-3 text-2xl font-bold text-foreground capitalize">{sub?.plan || 'Free'}</p>
              <p className="text-xs text-muted-foreground">Current Plan</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10">
                <CheckCircle className="h-4 w-4 text-success" />
              </div>
              <p className="mt-3 text-2xl font-bold text-foreground">GH₵{summary?.totalSpent.toFixed(2) || '0.00'}</p>
              <p className="text-xs text-muted-foreground">Total Spent</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10">
                <Calendar className="h-4 w-4 text-info" />
              </div>
              <p className="mt-3 text-2xl font-bold text-foreground">{sub?.days_remaining || 0}</p>
              <p className="text-xs text-muted-foreground">Days Remaining</p>
            </CardContent>
          </Card>
        </div>

        {/* Subscription status */}
        {sub && (
          <Card className={isSubActive ? 'border-success/30' : 'border-destructive/30'}>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Subscription Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground capitalize">{sub.plan.replace('_', ' ')}</span>
                    <Badge className={isSubActive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}>{sub.status}</Badge>
                    {sub.auto_renew && <Badge variant="outline" className="text-xs">Auto-renew</Badge>}
                  </div>
                  {sub.ends_at && (
                    <p className="text-xs text-muted-foreground">
                      {isSubActive
                        ? `Renews on ${new Date(sub.ends_at).toLocaleDateString('en-GH')}`
                        : `Expired on ${new Date(sub.ends_at).toLocaleDateString('en-GH')}`}
                    </p>
                  )}
                </div>
                {summary?.upcomingRenewalDate && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Next billing</p>
                    <p className="text-sm font-medium text-foreground">{new Date(summary.upcomingRenewalDate).toLocaleDateString('en-GH')}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent payments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Recent Payments
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {summary && summary.recentPayments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.recentPayments.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.payment_reference || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{p.payment_type}</Badge></TableCell>
                      <TableCell className="font-medium">GH₵{p.amount.toFixed(2)}</TableCell>
                      <TableCell><Badge className={PAYMENT_STATUSES[p.status as keyof typeof PAYMENT_STATUSES]?.color || 'bg-muted text-muted-foreground'}>{PAYMENT_STATUSES[p.status as keyof typeof PAYMENT_STATUSES]?.label || p.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString('en-GH')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">No payments yet</div>
            )}
          </CardContent>
        </Card>
      </div>
    </VendorDashboardLayout>
  );
}
