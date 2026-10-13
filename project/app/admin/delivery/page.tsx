'use client';

import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAdminDeliveryOperations } from '@/lib/data/admin-client';
import type { AdminDeliveryItem } from '@/lib/types/admin';
import { ChevronLeft, ChevronRight, Truck } from 'lucide-react';

export default function AdminDeliveryPage() {
  return <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>;
}

function Content() {
  const [orders, setOrders] = useState<AdminDeliveryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getAdminDeliveryOperations({ status, search: deferredSearch, limit: pageSize, offset: page * pageSize });
      setOrders(result.orders);
      setTotal(result.total);
    } catch {
      setOrders([]);
      setTotal(0);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [deferredSearch, page, status]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="max-w-7xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground"><Truck className="h-6 w-6 text-primary" /> Delivery Operations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Scoped, read-only tracking of delivery and handoff progress. Order transitions remain with trusted vendor/customer workflows.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select value={status} onValueChange={value => { setStatus(value); setPage(0); }}>
          <SelectTrigger aria-label="Filter delivery orders by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All operational deliveries</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="ready">Ready for handoff</SelectItem>
            <SelectItem value="out_for_delivery">Out for delivery</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search order number or vendor (3+ characters)" aria-label="Search delivery operations" />
      </div>

      <Card><CardContent className="p-0">
        {loading ? <div className="space-y-2 p-4">{[1, 2, 3, 4].map(row => <Skeleton key={row} className="h-12 rounded-lg" />)}</div>
          : error ? <div className="space-y-3 py-12 text-center text-sm text-muted-foreground"><p>Unable to load delivery operations. Please try again.</p><Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div>
            : orders.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">No delivery operations match your filters.</div>
              : <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>University</TableHead><TableHead>Vendor</TableHead><TableHead>Order status</TableHead><TableHead>Method</TableHead><TableHead>Latest handoff event</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
                <TableBody>{orders.map(order => <TableRow key={order.order_id}>
                  <TableCell className="font-mono text-xs">{order.order_number || '—'}</TableCell>
                  <TableCell>{order.university_name || '—'}</TableCell>
                  <TableCell>{order.vendor_name || '—'}</TableCell>
                  <TableCell><Badge variant="outline">{order.order_status.replaceAll('_', ' ')}</Badge></TableCell>
                  <TableCell className="capitalize">{order.delivery_method || '—'}</TableCell>
                  <TableCell>{order.latest_event?.replaceAll('_', ' ') || 'No handoff event recorded'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(order.latest_event_at || order.created_at).toLocaleString('en-GH', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                </TableRow>)}</TableBody>
              </Table></div>}
      </CardContent></Card>

      {total > pageSize && <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(total / pageSize)}</p>
        <div className="flex gap-1"><Button variant="outline" size="sm" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(current => current - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="sm" aria-label="Next page" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(current => current + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
      </div>}
    </div>
  );
}
