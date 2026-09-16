'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { getRevenueStats, getRevenueByUniversity, exportToCsv } from '@/lib/data/payment-client';
import type { AdminFinancialSummary } from '@/lib/types/payment';
import { Wallet, Download, TrendingUp, DollarSign, CreditCard, Megaphone, AlertCircle, Clock, RotateCcw, ShoppingCart, Building2 } from 'lucide-react';

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--info))'];

export default function AdminFinancialPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AdminFinancialSummary | null>(null);
  const [uniRevenue, setUniRevenue] = useState<Array<{ name: string; revenue: number; count: number }>>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [data, uniData] = await Promise.all([getRevenueStats(), getRevenueByUniversity()]);
    setSummary(data);
    setUniRevenue(uniData);
    setLoading(false);
  }

  const handleExport = () => {
    if (!summary) return;
    exportToCsv(summary.monthlyData.map(d => ({ month: d.month, revenue: d.revenue.toFixed(2) })), 'revenue');
  };

  const chartConfig = {
    revenue: { label: 'Revenue (GH₵)', color: 'hsl(var(--primary))' },
    subscriptions: { label: 'Subscriptions', color: 'hsl(var(--primary))' },
    ads: { label: 'Advertisements', color: 'hsl(var(--accent))' },
    marketplace: { label: 'Marketplace', color: 'hsl(var(--info))' },
  };

  if (loading || !summary) {
    return (
      <div className="p-6 space-y-4 max-w-5xl">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Financial Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Revenue overview and financial reporting</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Export</Button>
      </div>

      {/* Revenue cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10"><DollarSign className="h-4 w-4 text-success" /></div>
            <p className="mt-3 text-2xl font-bold text-foreground">GH₵{summary.totalRevenue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><TrendingUp className="h-4 w-4 text-primary" /></div>
            <p className="mt-3 text-2xl font-bold text-foreground">GH₵{summary.monthlyRevenue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">This Month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10"><DollarSign className="h-4 w-4 text-info" /></div>
            <p className="mt-3 text-2xl font-bold text-foreground">GH₵{summary.dailyRevenue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10"><AlertCircle className="h-4 w-4 text-destructive" /></div>
            <p className="mt-3 text-2xl font-bold text-foreground">{summary.failedPayments}</p>
            <p className="text-xs text-muted-foreground">Failed Payments</p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10"><Clock className="h-4 w-4 text-warning" /></div>
            <p className="mt-3 text-xl font-bold text-foreground">{summary.outstandingPayments}</p>
            <p className="text-xs text-muted-foreground">Outstanding / Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10"><RotateCcw className="h-4 w-4 text-accent" /></div>
            <p className="mt-3 text-xl font-bold text-foreground">{summary.pendingRefunds}</p>
            <p className="text-xs text-muted-foreground">Pending Refund Requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10"><ShoppingCart className="h-4 w-4 text-success" /></div>
            <p className="mt-3 text-xl font-bold text-foreground">GH₵{summary.marketplaceRevenue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Marketplace Revenue</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Monthly revenue trend */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Monthly Revenue Trend</CardTitle></CardHeader>
          <CardContent>
            {summary.monthlyData.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-72 w-full">
                <BarChart data={summary.monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `GH₵${v}`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">No revenue data yet</div>
            )}
          </CardContent>
        </Card>

        {/* Revenue by type */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Revenue by Type</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-72 w-full">
              <PieChart>
                <Pie data={summary.revenueByType} dataKey="revenue" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={(entry: { type: string }) => entry.type}>
                  {summary.revenueByType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Revenue breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Revenue Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-2"><CreditCard className="h-3.5 w-3.5" /> Subscription revenue</span><span className="font-medium">GH₵{summary.subscriptionRevenue.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-2"><Megaphone className="h-3.5 w-3.5" /> Advertisement revenue</span><span className="font-medium">GH₵{summary.adRevenue.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-2"><ShoppingCart className="h-3.5 w-3.5" /> Marketplace revenue</span><span className="font-medium">GH₵{summary.marketplaceRevenue.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Refund summaries</span><span className="font-medium">GH₵0.00 (future)</span></div>
              <div className="flex justify-between border-t border-border pt-2"><span className="font-semibold">Total revenue</span><span className="font-bold text-primary">GH₵{summary.totalRevenue.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Projected annual revenue</span><span className="font-medium">GH₵{(summary.monthlyRevenue * 12).toFixed(2)}</span></div>
            </div>
          </CardContent>
        </Card>

        {/* University revenue */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Revenue by University</CardTitle></CardHeader>
          <CardContent>
            {uniRevenue.length > 0 ? (
              <div className="space-y-2 text-sm">
                {uniRevenue.map((u, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <div>
                      <span className="text-foreground">{u.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{u.count} payments</span>
                    </div>
                    <span className="font-medium">GH₵{u.revenue.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No university revenue data yet</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
