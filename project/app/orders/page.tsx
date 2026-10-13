'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RouteGuard } from '@/lib/auth/route-guard';
import { getStudentOrders } from '@/lib/data/marketplace-client';
import { ORDER_STATUS_LABELS } from '@/lib/types/marketplace';
import type { OrderWithDetails } from '@/lib/types/marketplace';
import type { OrderStatus } from '@/lib/types';
import {
  Package, ChevronRight, Image as ImageIcon, Wrench, Truck, Store,
} from 'lucide-react';

export default function OrdersPage() {
  return (
    <RouteGuard requireAuth>
      <SiteHeader />
      <OrdersContent />
      <SiteFooter />
    </RouteGuard>
  );
}

function OrdersContent() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');

  useEffect(() => { loadOrders(); }, [filter]);

  async function loadOrders() {
    setLoading(true);
    const data = await getStudentOrders(filter === 'all' ? undefined : filter);
    setOrders(data);
    setLoading(false);
  }

  return (
    <main className="container max-w-4xl py-6 sm:py-8 px-4 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-foreground mb-2">My Orders</h1>
      <p className="text-sm text-muted-foreground mb-6">Track and manage your orders from campus vendors.</p>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList className="mb-6 flex flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="accepted">Accepted</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
          <TabsTrigger value="ready">Ready</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg font-semibold text-foreground">No orders yet</p>
            <p className="mt-1 text-sm text-muted-foreground">When you place an order, it will appear here.</p>
            <Button asChild className="mt-4"><Link href="/marketplace">Browse marketplace</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const statusInfo = ORDER_STATUS_LABELS[order.status] || ORDER_STATUS_LABELS.pending;
            const itemCount = order.items?.length || 0;
            const firstItem = order.items?.[0];
            const image = firstItem?.product?.image_url || firstItem?.service?.image_url || firstItem?.unit_image_url || null;

            return (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <Card className="transition-all hover:border-primary/30 hover:shadow-md cursor-pointer">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                      {image ? (
                        <img src={image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground/40">
                          {order.order_type === 'service' ? <Wrench className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{order.order_number || 'Order'}</p>
                        <Badge className={`text-xs ${
                          statusInfo.color === 'success' ? 'bg-success/10 text-success' :
                          statusInfo.color === 'warning' ? 'bg-warning/10 text-warning' :
                          statusInfo.color === 'error' ? 'bg-destructive/10 text-destructive' :
                          'bg-info/10 text-info'
                        }`}>
                          {statusInfo.label}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {order.vendor?.business_name || 'Unknown vendor'}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                        <span>GH₵{order.total_amount.toFixed(2)}</span>
                        <span className="flex items-center gap-1">
                          {order.delivery_method === 'delivery' ? <Truck className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                          {order.delivery_method === 'delivery' ? 'Delivery' : 'Pickup'}
                        </span>
                        <span>{new Date(order.created_at).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
