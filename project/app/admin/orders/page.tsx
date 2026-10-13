'use client';

import { useState, useEffect, useDeferredValue, useCallback } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAdminOrders, getOrderStats } from '@/lib/data/admin-client';
import type { AdminOrder } from '@/lib/types/admin';
import { ShoppingBag, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AdminOrdersPage() {
  return (
    <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>
  );
}

function Content() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, completed: 0, cancelled: 0, pending: 0 });
  const pageSize = 20;

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminOrders({ status: filter, search: deferredSearch, limit: pageSize, offset: page * pageSize });
      setOrders(result.orders);
      setTotal(result.total);
    } catch {
      setOrders([]);
      setTotal(0);
      setError('Unable to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [deferredSearch, filter, page]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);
  useEffect(() => {
    getOrderStats().then(setStats).catch(() => setError('Unable to load the order summary. Please try again.'));
  }, []);

  const completionRate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : '0';
  const cancellationRate = stats.total > 0 ? ((stats.cancelled / stats.total) * 100).toFixed(1) : '0';

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" /> Order Monitoring
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Read-only visibility into marketplace activity</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-xs text-muted-foreground">Total Orders</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-success">{stats.completed}</p><p className="text-xs text-muted-foreground">Completed ({completionRate}%)</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-destructive">{stats.cancelled}</p><p className="text-xs text-muted-foreground">Cancelled ({cancellationRate}%)</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-warning">{stats.pending}</p><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
      </div>

      <Tabs value={filter} onValueChange={v => { setFilter(v); setPage(0); }}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="accepted">Accepted</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      <Input
        value={search}
        onChange={(event) => { setSearch(event.target.value); setPage(0); }}
        placeholder="Search order number, buyer, email, or vendor"
        aria-label="Search orders"
        className="max-w-md"
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : error ? (
            <div className="space-y-3 py-12 text-center text-sm text-muted-foreground">
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={loadOrders}>Retry</Button>
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No orders found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.order_number || '—'}</TableCell>
                    <TableCell className="text-sm">{o.buyer?.full_name || '—'}</TableCell>
                    <TableCell className="text-sm">{o.vendor?.business_name || '—'}</TableCell>
                    <TableCell><Badge className={
                      o.status === 'completed' ? 'bg-success/10 text-success' :
                      o.status === 'cancelled' ? 'bg-destructive/10 text-destructive' :
                      o.status === 'pending' ? 'bg-warning/10 text-warning' :
                      'bg-info/10 text-info'
                    }>{o.status}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{o.order_type}</Badge></TableCell>
                    <TableCell className="text-sm font-medium">GH₵{o.total_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString('en-GH')}</TableCell>
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
