'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import { getVendorAnalytics } from '@/lib/data/vendor-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { VendorAnalytics } from '@/lib/types/vendor';
import {
  Eye, Package, Wrench, MessageSquare, Heart, Search,
  Star, TrendingUp, BarChart3, ShieldCheck, Clock,
} from 'lucide-react';

export default function AnalyticsPage() {
  return (
    <VendorRouteGuard>
      <SiteHeader />
      <AnalyticsContent />
      <SiteFooter />
    </VendorRouteGuard>
  );
}

function AnalyticsContent() {
  const { vendor, loading } = useVendor();
  const [analytics, setAnalytics] = useState<VendorAnalytics | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!vendor) return;
    loadAnalytics();
  }, [vendor]);

  async function loadAnalytics() {
    if (!vendor) return;
    setDataLoading(true);
    const data = await getVendorAnalytics(vendor.id);
    setAnalytics(data);
    setDataLoading(false);
  }

  if (loading) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </VendorDashboardLayout>
    );
  }

  const stats = [
    { label: 'Profile Views', value: analytics?.profile_views ?? 0, icon: Eye, color: 'bg-primary/10 text-primary' },
    { label: 'Product Views', value: analytics?.product_views ?? 0, icon: Package, color: 'bg-success/10 text-success' },
    { label: 'Service Views', value: analytics?.service_views ?? 0, icon: Wrench, color: 'bg-accent/10 text-accent' },
    { label: 'Search Appearances', value: analytics?.search_appearances ?? 0, icon: Search, color: 'bg-secondary/15 text-secondary' },
    { label: 'Messages Received', value: analytics?.messages_received ?? 0, icon: MessageSquare, color: 'bg-warning/10 text-warning' },
    { label: 'Saved By Students', value: analytics?.saved_count ?? 0, icon: Heart, color: 'bg-destructive/10 text-destructive' },
  ];

  const trustStats = [
    { label: 'Response Rate', value: analytics?.response_rate ? `${analytics.response_rate}%` : '—', icon: TrendingUp },
    { label: 'Avg Response Time', value: analytics?.avg_response_time_hours ? `${analytics.avg_response_time_hours}h` : '—', icon: Clock },
    { label: 'Trust Score', value: analytics?.trust_score ? `${analytics.trust_score}/100` : '—', icon: ShieldCheck },
    { label: 'Average Rating', value: vendor?.rating_avg ? vendor.rating_avg.toFixed(1) : '—', icon: Star },
  ];

  // Monthly chart data
  const monthlyViews = analytics?.monthly_profile_views || {};
  const monthlyMessages = analytics?.monthly_messages || {};
  const months = Object.keys(monthlyViews).sort().slice(-6);
  const maxViews = Math.max(...Object.values(monthlyViews), 1);

  return (
    <VendorDashboardLayout
      vendorName={vendor?.business_name || ''}
      isVerified={vendor?.is_verified || false}
      subscriptionStatus=""
    >
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track how your business is performing.</p>
      </div>

      {/* Stats grid */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map(stat => (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Trust metrics */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Trust & Response</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trustStats.map(stat => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <stat.icon className="h-4 w-4 text-primary" />
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
                <p className="mt-2 text-xl font-bold text-foreground">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Monthly chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5 text-primary" />
            Profile Views (Last 6 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dataLoading ? (
            <Skeleton className="h-48 rounded-lg" />
          ) : months.length > 0 ? (
            <div className="flex items-end justify-between gap-2 h-48">
              {months.map(month => {
                const views = monthlyViews[month] || 0;
                const messages = monthlyMessages[month] || 0;
                const height = (views / maxViews) * 100;
                return (
                  <div key={month} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="w-full rounded-t-md bg-primary/80 transition-all hover:bg-primary"
                        style={{ height: `${Math.max(height, 2)}%` }}
                        title={`${views} views`}
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-foreground">{views}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(month + '-01').toLocaleDateString('en-GH', { month: 'short' })}
                      </p>
                      {messages > 0 && <p className="text-xs text-primary">{messages} msgs</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-center">
              <div>
                <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">No analytics data yet. Data will appear as students interact with your profile.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Note */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">Growing your business</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Complete your profile, add high-quality photos, respond to reviews quickly, and keep your products updated to improve your visibility and trust score.
            </p>
          </div>
        </CardContent>
      </Card>
    </VendorDashboardLayout>
  );
}
