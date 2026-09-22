'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { getPlatformStats, getOrderTrends, getCategoryPopularity, getDailyActiveUsers } from '@/lib/data/admin-client';
import type { AdminStats } from '@/lib/types/admin';
import { Users, Store, GraduationCap, ShoppingBag, CreditCard, Package, Wrench, Calendar, TrendingUp, DollarSign } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orderTrends, setOrderTrends] = useState<Array<{ date: string; count: number }>>([]);
  const [userTrends, setUserTrends] = useState<Array<{ date: string; count: number }>>([]);
  const [categoryData, setCategoryData] = useState<Array<{ category: string; count: number }>>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [s, ot, ut, cd] = await Promise.all([
      getPlatformStats(),
      getOrderTrends(30),
      getDailyActiveUsers(30),
      getCategoryPopularity(),
    ]);
    setStats(s);
    setOrderTrends(ot);
    setUserTrends(ut);
    setCategoryData(cd.slice(0, 8));
    setLoading(false);
  }

  if (loading || !stats) {
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

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-primary' },
    { label: 'Verified Students', value: stats.verifiedStudents, icon: GraduationCap, color: 'text-success' },
    { label: 'Student Vendors', value: stats.studentVendors, icon: Users, color: 'text-info' },
    { label: 'External Vendors', value: stats.externalVendors, icon: Store, color: 'text-accent' },
    { label: 'Businesses', value: stats.businesses, icon: Store, color: 'text-primary' },
    { label: 'Products', value: stats.products, icon: Package, color: 'text-info' },
    { label: 'Services', value: stats.services, icon: Wrench, color: 'text-accent' },
    { label: 'Orders', value: stats.orders, icon: ShoppingBag, color: 'text-warning' },
    { label: 'Universities', value: stats.universities, icon: GraduationCap, color: 'text-primary' },
    { label: 'Events', value: stats.events, icon: Calendar, color: 'text-info' },
    { label: 'Active Subscriptions', value: stats.activeSubscriptions, icon: CreditCard, color: 'text-success' },
    { label: 'Revenue', value: `GHS ${stats.totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-success' },
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
            {orderTrends.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <LineChart data={orderTrends}>
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
            {userTrends.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <BarChart data={userTrends}>
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
          <CardTitle className="text-sm font-semibold">Business Categories</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryData.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="count"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ category, percent }) => `${category} ${((percent || 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {categoryData.map((_, i) => (
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
