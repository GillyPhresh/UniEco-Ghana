'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { useAuth } from '@/lib/auth/auth-context';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { getAdminControlCenterSummary, getAdminOperationalAlerts, getAdminRecentActivity, getAdminUniversityControlCenterSummary } from '@/lib/data/admin-client';
import type { AdminControlCenterSummary, AdminOperationalAlert, AdminRecentActivityItem, AdminUniversityControlCenterSummary } from '@/lib/types/admin';
import { Users, Store, GraduationCap, ShoppingBag, CreditCard, Package, Wrench, Calendar, TrendingUp, ShieldCheck, Megaphone, LifeBuoy, Building2 } from 'lucide-react';

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--info))', 'hsl(var(--destructive))'];

export default function AdminDashboardPage() {
  return (
    <AdminRouteGuard>
      <AdminLayout>
        <DashboardContent />
      </AdminLayout>
    </AdminRouteGuard>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<
    | { kind: 'platform'; summary: AdminControlCenterSummary }
    | { kind: 'university'; summary: AdminUniversityControlCenterSummary }
    | { kind: 'operations' }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<AdminRecentActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [operationalAlerts, setOperationalAlerts] = useState<AdminOperationalAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const loadRecentActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      setRecentActivity(await getAdminRecentActivity(10));
    } catch {
      setRecentActivity([]);
      setActivityError('Unable to load recent activity. Please retry.');
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const loadOperationalAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      setOperationalAlerts(await getAdminOperationalAlerts());
    } catch {
      setOperationalAlerts([]);
      setAlertsError('Unable to load operational alerts. Please retry.');
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (user?.role === 'university_admin') {
        setDashboard({ kind: 'university', summary: await getAdminUniversityControlCenterSummary(30) });
      } else if (user?.role === 'super_admin') {
        setDashboard({ kind: 'platform', summary: await getAdminControlCenterSummary(30) });
      } else if (user?.role === 'moderator') {
        setDashboard({ kind: 'operations' });
      } else {
        throw new Error('Management role required');
      }
    } catch {
      setDashboard(null);
      setError('Unable to load management metrics. Check your access and try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (user?.role === 'super_admin' || user?.role === 'university_admin') void loadRecentActivity();
  }, [loadRecentActivity, user?.role]);

  useEffect(() => {
    if (user?.role === 'super_admin' || user?.role === 'university_admin' || user?.role === 'moderator') void loadOperationalAlerts();
  }, [loadOperationalAlerts, user?.role]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (!dashboard) {
    return <div className="p-6 space-y-4" role="alert"><p className="text-sm text-destructive">{error || 'Unable to load management metrics.'}</p><button className="text-sm underline" onClick={loadData}>Retry</button></div>;
  }

  if (dashboard.kind === 'university') {
    return <UniversityAdminOverview summary={dashboard.summary} recentActivity={recentActivity} activityLoading={activityLoading} activityError={activityError} onRetryActivity={loadRecentActivity} operationalAlerts={operationalAlerts} alertsLoading={alertsLoading} alertsError={alertsError} onRetryAlerts={loadOperationalAlerts} />;
  }

  if (dashboard.kind === 'operations') {
    return (
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <header>
          <h1 className="font-display text-2xl font-bold text-foreground">Operations Home</h1>
          <p className="mt-1 text-sm text-muted-foreground">Assigned operational queues only. Counts and links are limited by your database permissions.</p>
        </header>
        <OperationalAlertsPanel role="moderator" alerts={operationalAlerts} loading={alertsLoading} error={alertsError} onRetry={loadOperationalAlerts} />
      </div>
    );
  }

  const summary = dashboard.summary;

  const stats = summary.stats;

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-primary' },
    { label: 'Verified Students', value: stats.verifiedStudents, icon: GraduationCap, color: 'text-success' },
    { label: 'Student Vendors', value: stats.studentVendors, icon: Users, color: 'text-info' },
    { label: 'External Vendors', value: stats.externalVendors, icon: Store, color: 'text-accent' },
    { label: 'Businesses', value: stats.businesses, icon: Store, color: 'text-primary' },
    { label: 'Products', value: stats.products, icon: Package, color: 'text-info' },
    { label: 'Active Products', value: stats.activeProducts, icon: Package, color: 'text-success' },
    { label: 'Services', value: stats.services, icon: Wrench, color: 'text-accent' },
    { label: 'Orders Today', value: stats.ordersToday, icon: ShoppingBag, color: 'text-warning' },
    { label: 'Orders This Month', value: stats.ordersThisMonth, icon: ShoppingBag, color: 'text-warning' },
    { label: 'Pending Orders', value: stats.pendingOrders, icon: ShoppingBag, color: 'text-warning' },
    { label: 'Universities', value: stats.universities, icon: GraduationCap, color: 'text-primary' },
    { label: 'Active Universities', value: stats.activeUniversities, icon: GraduationCap, color: 'text-success' },
    { label: 'Events', value: stats.events, icon: Calendar, color: 'text-info' },
    { label: 'Active Subscriptions', value: stats.activeSubscriptions, icon: CreditCard, color: 'text-success' },
    { label: 'Pending Vendor Verification', value: stats.pendingVendorVerification, icon: ShieldCheck, color: 'text-warning' },
    { label: 'Pending Ad Approvals', value: stats.pendingAdApprovals, icon: Megaphone, color: 'text-warning' },
    { label: 'Unresolved Support Tickets', value: stats.unresolvedSupportTickets, icon: LifeBuoy, color: 'text-warning' },
  ];
  const pendingActions = [
    { label: 'Pending orders', value: stats.pendingOrders, href: '/admin/orders' },
    { label: 'Vendor verification reviews', value: stats.pendingVendorVerification, href: '/admin/verification/vendors' },
    { label: 'Advertisement approvals', value: stats.pendingAdApprovals, href: '/admin/advertisements' },
    { label: 'Unresolved support tickets', value: stats.unresolvedSupportTickets, href: '/admin/support' },
  ];

  const chartConfig = {
    orders: { label: 'Orders', color: 'hsl(var(--primary))' },
    users: { label: 'New Users', color: 'hsl(var(--accent))' },
    count: { label: 'Count', color: 'hsl(var(--primary))' },
  };

  return (
    <div className="min-w-0 p-4 sm:p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Platform Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Real-time statistics across the entire UniEco Ghana ecosystem.</p>
      </div>

      <PendingActionLinks actions={pendingActions} />
      <OperationalAlertsPanel role="super_admin" alerts={operationalAlerts} loading={alertsLoading} error={alertsError} onRetry={loadOperationalAlerts} />
      <RecentActivityPanel role="super_admin" entries={recentActivity} loading={activityLoading} error={activityError} onRetry={loadRecentActivity} />

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {statCards.map(card => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="min-w-0">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                </div>
                <p className="mt-3 truncate text-2xl font-bold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Order trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Order Trends (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.orderTrend.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <LineChart data={summary.orderTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={v => v.slice(5)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No order data yet</div>
            )}
          </CardContent>
        </Card>

        {/* User registration trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-accent" /> User Registrations (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.registrationTrend.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <BarChart data={summary.registrationTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={v => v.slice(5)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No user data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Active Businesses by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.businessCategories.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summary.businessCategories.slice(0, 8)}
                    dataKey="count"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ category, percent }) => `${category} ${((percent || 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {summary.businessCategories.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent nameKey="category" />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">No category data yet</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UniversityAdminOverview({
  summary,
  recentActivity,
  activityLoading,
  activityError,
  onRetryActivity,
  operationalAlerts,
  alertsLoading,
  alertsError,
  onRetryAlerts,
}: {
  summary: AdminUniversityControlCenterSummary;
  recentActivity: AdminRecentActivityItem[];
  activityLoading: boolean;
  activityError: string | null;
  onRetryActivity: () => void;
  operationalAlerts: AdminOperationalAlert[];
  alertsLoading: boolean;
  alertsError: string | null;
  onRetryAlerts: () => void;
}) {
  const stats = summary.stats;
  const statCards = [
    { label: 'Assigned Universities', value: stats.universities, icon: Building2 },
    { label: 'Students', value: stats.students, icon: GraduationCap },
    { label: 'Active Students', value: stats.activeStudents, icon: Users },
    { label: 'Verified Students', value: stats.verifiedStudents, icon: ShieldCheck },
    { label: 'Student Vendors', value: stats.studentVendors, icon: Store },
    { label: 'External Vendors', value: stats.externalVendors, icon: Store },
    { label: 'Active Vendors', value: stats.activeVendors, icon: Store },
    { label: 'Businesses', value: stats.businesses, icon: Building2 },
    { label: 'Active Businesses', value: stats.activeBusinesses, icon: Building2 },
    { label: 'Products', value: stats.products, icon: Package },
    { label: 'Active Products', value: stats.activeProducts, icon: Package },
    { label: 'Services', value: stats.services, icon: Wrench },
    { label: 'Active Services', value: stats.activeServices, icon: Wrench },
    { label: 'Orders Today', value: stats.ordersToday, icon: ShoppingBag },
    { label: 'Orders This Month', value: stats.ordersThisMonth, icon: ShoppingBag },
    { label: 'Pending Orders', value: stats.pendingOrders, icon: ShoppingBag },
    { label: 'Completed Orders', value: stats.completedOrders, icon: ShoppingBag },
    { label: 'Events', value: stats.events, icon: Calendar },
    { label: 'Pending Vendor Verification', value: stats.pendingVendorVerification, icon: ShieldCheck },
    { label: 'Unresolved Support Tickets', value: stats.unresolvedSupportTickets, icon: LifeBuoy },
  ];
  const pendingActions = [
    { label: 'Pending orders', value: stats.pendingOrders, href: '/admin/orders' },
    { label: 'Vendor verification reviews', value: stats.pendingVendorVerification, href: '/admin/verification/vendors' },
  ];
  const chartConfig = {
    orders: { label: 'Orders', color: 'hsl(var(--primary))' },
    users: { label: 'New Students', color: 'hsl(var(--accent))' },
    count: { label: 'Count', color: 'hsl(var(--primary))' },
  };

  return (
    <div className="min-w-0 p-4 sm:p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">University Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Operational activity across universities assigned to your account. Financial and platform-wide controls are not available here.</p>
      </div>
      <PendingActionLinks actions={pendingActions} />
      <OperationalAlertsPanel role="university_admin" alerts={operationalAlerts} loading={alertsLoading} error={alertsError} onRetry={onRetryAlerts} />
      <RecentActivityPanel role="university_admin" entries={recentActivity} loading={activityLoading} error={activityError} onRetry={onRetryActivity} />
      <section aria-label="Assigned university metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {statCards.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="min-w-0">
            <CardContent className="p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Icon className="h-4 w-4 text-primary" /></div>
              <p className="mt-3 truncate text-2xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Orders (30 days)</CardTitle></CardHeader>
          <CardContent>
            {summary.orderTrend.length ? <ChartContainer config={chartConfig} className="h-64 w-full">
              <LineChart data={summary.orderTrend}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="date" tickFormatter={value => value.slice(5)} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} /></LineChart>
            </ChartContainer> : <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No order data available</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-accent" /> Student registrations (30 days)</CardTitle></CardHeader>
          <CardContent>
            {summary.registrationTrend.length ? <ChartContainer config={chartConfig} className="h-64 w-full">
              <BarChart data={summary.registrationTrend}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="date" tickFormatter={value => value.slice(5)} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} /></BarChart>
            </ChartContainer> : <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No registration data available</div>}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Assigned university activity</CardTitle></CardHeader>
        <CardContent>
          {summary.universityActivity.length ? <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 font-medium">University</th><th className="py-2 font-medium">Students</th><th className="py-2 font-medium">Vendors</th><th className="py-2 font-medium">Businesses</th></tr></thead>
            <tbody>{summary.universityActivity.map(university => <tr key={university.name} className="border-b last:border-0"><th scope="row" className="py-3 text-left font-medium">{university.name}</th><td className="py-3">{university.students}</td><td className="py-3">{university.vendors}</td><td className="py-3">{university.businesses}</td></tr>)}</tbody>
          </table></div> : <p className="text-sm text-muted-foreground">No assigned university data available.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Active businesses by category</CardTitle></CardHeader>
        <CardContent>
          {summary.businessCategories.length ? <ChartContainer config={chartConfig} className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><PieChart>
            <Pie data={summary.businessCategories.slice(0, 8)} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={100} label={({ category, percent }) => `${category} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={false}>
              {summary.businessCategories.slice(0, 8).map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
            </Pie><ChartTooltip content={<ChartTooltipContent nameKey="category" />} />
          </PieChart></ResponsiveContainer></ChartContainer> : <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">No category data available</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function PendingActionLinks({ actions }: { actions: Array<{ label: string; value: number; href: string }> }) {
  const outstanding = actions.filter(action => action.value > 0);
  return (
    <section aria-labelledby="pending-actions-title" className="space-y-3">
      <h2 id="pending-actions-title" className="text-sm font-semibold text-foreground">Pending actions</h2>
      {outstanding.length === 0 ? <p className="text-sm text-muted-foreground">No outstanding items in these queues.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {outstanding.map(action => (
            <Link key={action.href} href={action.href} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <span className="text-sm text-muted-foreground">{action.label}</span>
                  <span className="text-xl font-bold text-foreground">{action.value}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function RecentActivityPanel({
  role,
  entries,
  loading,
  error,
  onRetry,
}: {
  role: 'super_admin' | 'university_admin';
  entries: AdminRecentActivityItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <Card aria-labelledby="recent-management-activity">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle id="recent-management-activity" className="text-sm font-semibold">Recent management activity</CardTitle>
        {role === 'super_admin' && <Link href="/admin/audit-logs" className="text-xs text-primary underline-offset-4 hover:underline">Audit log</Link>}
      </CardHeader>
      <CardContent>
        {loading ? <div className="space-y-2" aria-label="Loading recent activity">{[1, 2, 3].map(row => <Skeleton key={row} className="h-10" />)}</div> : error ? (
          <div role="alert" className="flex items-center justify-between gap-3 text-sm"><span className="text-destructive">{error}</span><button className="underline" onClick={onRetry}>Retry</button></div>
        ) : entries.length === 0 ? <p className="text-sm text-muted-foreground">No recent administrative activity.</p> : (
          <ul className="divide-y">
            {entries.map(entry => {
              const href = activityHref(entry, role);
              const description = entry.action.replace(/[._]/g, ' ');
              const item = <span className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm"><span className="font-medium">{entry.actor_name || 'Authorized administrator'}</span> {description}</span><time className="text-xs text-muted-foreground" dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></span>;
              return <li key={entry.id}>{href ? <Link href={href} className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">{item}</Link> : item}</li>;
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function OperationalAlertsPanel({
  role,
  alerts,
  loading,
  error,
  onRetry,
}: {
  role: 'super_admin' | 'university_admin' | 'moderator';
  alerts: AdminOperationalAlert[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const labels: Record<AdminOperationalAlert['alert_key'], string> = {
    payment_reconciliation: 'Payments need reconciliation',
    communication_failures: 'Communication delivery failures (24h)',
    urgent_support: 'High-priority support tickets',
    priority_reports: 'High-priority trust & safety reports',
    content_reviews: 'Reviews awaiting moderation',
    pending_advertisements: 'Advertisements awaiting review',
    stale_vendor_verification: 'Vendor verifications waiting over 72 hours',
    low_stock_products: 'Active products at or below low-stock threshold',
  };
  const routes: Record<AdminOperationalAlert['alert_key'], string> = {
    payment_reconciliation: '/admin/payments', communication_failures: '/admin/communication',
    urgent_support: '/admin/support', priority_reports: '/admin/trust-safety',
    content_reviews: '/admin/reviews', pending_advertisements: '/admin/advertisements',
    stale_vendor_verification: '/admin/verification/vendors', low_stock_products: '/admin/businesses',
  };
  return (
    <Card aria-labelledby="operational-alerts-title">
      <CardHeader><CardTitle id="operational-alerts-title" className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-warning" /> Operational alerts</CardTitle></CardHeader>
      <CardContent>
        {loading ? <div className="space-y-2" aria-label="Loading operational alerts">{[1, 2, 3].map(item => <Skeleton key={item} className="h-10" />)}</div> : error ? (
          <div role="alert" className="flex items-center justify-between gap-3 text-sm"><span className="text-destructive">{error}</span><button className="underline" onClick={onRetry}>Retry</button></div>
        ) : alerts.length === 0 ? <p className="text-sm text-muted-foreground">No operational alerts right now.</p> : (
          <ul className="divide-y">
            {alerts.map(alert => {
              const href = role === 'university_admin' && alert.alert_key === 'low_stock_products' ? routes.low_stock_products : routes[alert.alert_key];
              const severityClass = alert.severity === 'critical' ? 'text-destructive' : alert.severity === 'high' ? 'text-warning' : 'text-muted-foreground';
              return <li key={alert.alert_key}><Link href={href} className="flex items-center justify-between gap-3 rounded-sm py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className={`text-sm ${severityClass}`}>{labels[alert.alert_key]}</span><span className="whitespace-nowrap text-sm font-semibold">{alert.affected_count.toLocaleString()}<span className="sr-only"> affected records</span></span></Link></li>;
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function activityHref(entry: AdminRecentActivityItem, role: 'super_admin' | 'university_admin'): string | null {
  if (entry.module === 'verification') {
    return entry.action.startsWith('vendor.') ? '/admin/verification/vendors' : '/admin/verification/students';
  }
  const routes: Record<string, string> = {
    students: '/admin/students', vendors: '/admin/verification/vendors', universities: '/admin/universities',
    businesses: '/admin/businesses', orders: '/admin/orders', events: '/admin/events',
    users: '/admin/users', support: '/admin/support', advertisements: '/admin/advertisements',
    moderation: '/admin/trust-safety', cms: '/admin/cms', announcements: '/admin/announcements',
  };
  const universityRoutes = new Set(['students', 'vendors', 'universities', 'businesses', 'orders', 'events']);
  if (role === 'university_admin' && !universityRoutes.has(entry.module)) return null;
  return routes[entry.module] || null;
}
