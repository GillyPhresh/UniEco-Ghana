'use client';

import { useState, useEffect } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area, LineChart, Line } from 'recharts';
import { getDailyActiveUsers, getOrderTrends, getUniversityGrowth, getCategoryPopularity } from '@/lib/data/admin-client';
import { BarChart3, TrendingUp, Users, ShoppingBag } from 'lucide-react';

export default function AdminAnalyticsPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [userTrends, setUserTrends] = useState<Array<{ date: string; count: number }>>([]);
  const [orderTrends, setOrderTrends] = useState<Array<{ date: string; count: number }>>([]);
  const [universityGrowth, setUniversityGrowth] = useState<Array<{ name: string; students: number; vendors: number; businesses: number }>>([]);
  const [categoryData, setCategoryData] = useState<Array<{ category: string; count: number }>>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [ut, ot, ug, cd] = await Promise.all([
      getDailyActiveUsers(30), getOrderTrends(30), getUniversityGrowth(), getCategoryPopularity(),
    ]);
    setUserTrends(ut);
    setOrderTrends(ot);
    setUniversityGrowth(ug);
    setCategoryData(cd);
    setLoading(false);
  }

  const chartConfig = {
    users: { label: 'New Users', color: 'hsl(var(--primary))' },
    orders: { label: 'Orders', color: 'hsl(var(--accent))' },
    students: { label: 'Students', color: 'hsl(var(--primary))' },
    vendors: { label: 'Vendors', color: 'hsl(var(--accent))' },
    count: { label: 'Count', color: 'hsl(var(--primary))' },
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-72 rounded-xl" />)}</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Analytics Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Platform-wide analytics and growth trends</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> User Registration (30 days)</CardTitle></CardHeader>
          <CardContent>
            {userTrends.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <AreaChart data={userTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={v => v.slice(5)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area dataKey="count" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.2)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            ) : <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No data</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-accent" /> Order Trends (30 days)</CardTitle></CardHeader>
          <CardContent>
            {orderTrends.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <LineChart data={orderTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={v => v.slice(5)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line dataKey="count" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            ) : <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No data</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-success" /> University Growth</CardTitle></CardHeader>
          <CardContent>
            {universityGrowth.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <BarChart data={universityGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tickFormatter={v => v.slice(0, 10)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="students" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="vendors" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No data</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Category Popularity</CardTitle></CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <BarChart data={categoryData.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="category" tickFormatter={v => v.slice(0, 12)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={100} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No data</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
