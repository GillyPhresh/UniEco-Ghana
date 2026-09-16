'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import { getVendorDashboardData } from '@/lib/data/vendor-client';
import { getUnreadNotificationCount, getNotifications } from '@/lib/data/student-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Package, Wrench, Star, MessageSquare, Eye, Heart,
  TrendingUp, AlertTriangle, Clock, ShieldCheck, CreditCard,
  ArrowRight, Bell, Store, BarChart3,
} from 'lucide-react';
import { VERIFICATION_STATUS_LABELS } from '@/lib/types/vendor';
import { getBusinessStatus } from '@/lib/data/vendor-client';

export default function VendorDashboardPage() {
  return (
    <VendorRouteGuard>
      <SiteHeader />
      <VendorDashboardContent />
      <SiteFooter />
    </VendorRouteGuard>
  );
}

function VendorDashboardContent() {
  const { user } = useAuth();
  const { vendor, loading: vendorLoading } = useVendor();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<Awaited<ReturnType<typeof getVendorDashboardData>> | null>(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [recentNotifs, setRecentNotifs] = useState<{ id: string; title: string | null; body: string | null; created_at: string; is_read: boolean }[]>([]);

  useEffect(() => {
    if (!vendor) {
      if (!vendorLoading) setLoading(false);
      return;
    }
    loadData();
  }, [vendor, vendorLoading]);

  async function loadData() {
    if (!vendor) return;
    setLoading(true);

    const [data, unread, notifs] = await Promise.all([
      getVendorDashboardData(vendor.id),
      getUnreadNotificationCount(),
      getNotifications(3),
    ]);

    setDashboardData(data);
    setUnreadNotifs(unread);
    setRecentNotifs(notifs as typeof recentNotifs);
    setLoading(false);
  }

  if (vendorLoading || (!vendor && loading)) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Skeleton className="h-8 w-64" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </VendorDashboardLayout>
    );
  }

  if (!vendor) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Store className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-3 text-lg font-semibold text-foreground">No business registered</p>
            <p className="mt-1 text-sm text-muted-foreground">Register your business to get started.</p>
            <Button asChild className="mt-4">
              <Link href="/start-business">Register your business</Link>
            </Button>
          </CardContent>
        </Card>
      </VendorDashboardLayout>
    );
  }

  const verificationInfo = user?.vendorProfile?.verification_status
    ? VERIFICATION_STATUS_LABELS[user.vendorProfile.verification_status] || VERIFICATION_STATUS_LABELS.pending
    : VERIFICATION_STATUS_LABELS.pending;

  const businessStatus = dashboardData?.hours
    ? getBusinessStatus(dashboardData.hours, vendor.is_temporarily_closed)
    : { status: 'closed' as const, label: 'Closed', color: 'error' };

  const analytics = dashboardData?.analytics;
  const stats = [
    { label: 'Profile Views', value: analytics?.profile_views ?? 0, icon: Eye, color: 'bg-primary/10 text-primary' },
    { label: 'Products', value: dashboardData?.activeProducts ?? 0, icon: Package, color: 'bg-success/10 text-success' },
    { label: 'Services', value: dashboardData?.activeServices ?? 0, icon: Wrench, color: 'bg-accent/10 text-accent' },
    { label: 'Reviews', value: vendor.rating_count, icon: Star, color: 'bg-warning/10 text-warning' },
    { label: 'Messages', value: analytics?.messages_received ?? 0, icon: MessageSquare, color: 'bg-secondary/15 text-secondary' },
    { label: 'Saved By', value: analytics?.saved_count ?? 0, icon: Heart, color: 'bg-destructive/10 text-destructive' },
  ];

  return (
    <VendorDashboardLayout
      vendorName={vendor.business_name}
      isVerified={vendor.is_verified}
      subscriptionStatus={user?.vendorProfile?.subscription_status ?? 'none'}
    >
      {/* Welcome header */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {vendor.business_name}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Here is how your business is doing today.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={`${businessStatus.color === 'success' ? 'bg-success/10 text-success border-success/20' : businessStatus.color === 'warning' ? 'bg-warning/10 text-warning border-warning/20' : 'bg-destructive/10 text-destructive border-destructive/20'} text-xs`}>
            <Clock className="mr-1 h-3 w-3" /> {businessStatus.label}
          </Badge>
          <Badge className={`text-xs ${verificationInfo.color === 'success' ? 'bg-success/10 text-success border-success/20' : verificationInfo.color === 'warning' ? 'bg-warning/10 text-warning border-warning/20' : verificationInfo.color === 'error' ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-muted text-muted-foreground'}`}>
            <ShieldCheck className="mr-1 h-3 w-3" /> {verificationInfo.label}
          </Badge>
        </div>
      </div>

      {/* Status cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Verification</p>
              <p className="text-sm font-semibold text-foreground">{verificationInfo.label}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <CreditCard className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Subscription</p>
              <p className="text-sm font-semibold text-foreground capitalize">
                {user?.vendorProfile?.subscription_status === 'active' ? 'Active' : 'No active plan'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
              <Star className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rating</p>
              <p className="text-sm font-semibold text-foreground">
                {vendor.rating_avg > 0 ? `${vendor.rating_avg.toFixed(1)} (${vendor.rating_count})` : 'No ratings yet'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats grid */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Monthly Summary
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => (
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left — quick actions & alerts */}
        <div className="space-y-6 lg:col-span-2">
          {/* Alerts */}
          {dashboardData && dashboardData.lowStockProducts.length > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Low Stock Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dashboardData.lowStockProducts.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-card p-3">
                    <span className="text-sm font-medium text-foreground">{p.name}</span>
                    <Badge className="bg-warning/10 text-warning border-warning/20 text-xs">
                      {p.stock} left
                    </Badge>
                  </div>
                ))}
                <Button asChild variant="outline" size="sm" className="mt-2 w-full">
                  <Link href="/vendor-dashboard/products">Manage products</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Unread reviews */}
          {dashboardData && dashboardData.unreadReviews > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Star className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {dashboardData.unreadReviews} {dashboardData.unreadReviews === 1 ? 'review' : 'reviews'} awaiting response
                    </p>
                    <p className="text-xs text-muted-foreground">Respond to build trust with customers</p>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/vendor-dashboard/reviews">View reviews</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Quick links */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Quick Actions
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <QuickLink icon={Package} label="Add Product" href="/vendor-dashboard/products" />
              <QuickLink icon={Wrench} label="Add Service" href="/vendor-dashboard/services" />
              <QuickLink icon={BarChart3} label="View Analytics" href="/vendor-dashboard/analytics" />
            </div>
          </div>
        </div>

        {/* Right — notifications */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bell className="h-4 w-4 text-primary" />
                  Notifications
                </CardTitle>
                {unreadNotifs > 0 && (
                  <Badge className="bg-primary text-primary-foreground text-xs">{unreadNotifs}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {recentNotifs.length > 0 ? (
                <div className="space-y-2">
                  {recentNotifs.map((n) => (
                    <div
                      key={n.id}
                      className={`rounded-lg p-3 ${n.is_read ? 'bg-muted/30' : 'bg-primary/5 border border-primary/20'}`}
                    >
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {new Date(n.created_at).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  ))}
                  <Link href="/dashboard/notifications" className="block pt-1 text-center text-xs text-primary hover:underline">
                    View all notifications
                  </Link>
                </div>
              ) : (
                <div className="py-4 text-center">
                  <Bell className="mx-auto h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-2 text-xs text-muted-foreground">No notifications yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </VendorDashboardLayout>
  );
}

function QuickLink({ icon: Icon, label, href }: { icon: typeof Package; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex items-center gap-1 text-sm font-medium text-foreground group-hover:text-primary">
        {label}
        <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
    </Link>
  );
}
