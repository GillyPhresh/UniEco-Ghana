'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import {
  getVendorOrders, updateOrderStatus, rejectOrder, updateBookingStatus,
  updateVendorOrderNotes,
} from '@/lib/data/marketplace-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ORDER_STATUS_LABELS, BOOKING_STATUS_LABELS } from '@/lib/types/marketplace';
import type { OrderWithDetails } from '@/lib/types/marketplace';
import type { OrderStatus } from '@/lib/types';
import {
  Package, Check, X, Clock, Truck, Store, CheckCircle,
  Image as ImageIcon, Wrench, Loader2, Calendar, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';

export default function VendorOrdersPage() {
  return (
    <VendorRouteGuard>
      <SiteHeader />
      <VendorOrdersContent />
      <SiteFooter />
    </VendorRouteGuard>
  );
}

function VendorOrdersContent() {
  const { vendor, loading } = useVendor();
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [vendorNotes, setVendorNotes] = useState('');

  useEffect(() => { loadOrders(); }, [filter]);

  async function loadOrders() {
    setDataLoading(true);
    const data = await getVendorOrders(filter === 'all' ? undefined : filter);
    setOrders(data);
    setDataLoading(false);
  }

  const handleAccept = async (orderId: string) => {
    const { error } = await updateOrderStatus(orderId, 'accepted', 'Order accepted by vendor');
    if (error) { toast.error(error); } else { toast.success('Order accepted'); loadOrders(); }
  };

  const handleProcess = async (orderId: string) => {
    const { error } = await updateOrderStatus(orderId, 'processing', 'Order is being prepared');
    if (error) { toast.error(error); } else { toast.success('Order status updated'); loadOrders(); }
  };

  const handleReady = async (orderId: string) => {
    const { error } = await updateOrderStatus(orderId, 'ready', 'Order is ready for pickup/delivery');
    if (error) { toast.error(error); } else { toast.success('Order marked as ready'); loadOrders(); }
  };

  const handleDeliver = async (orderId: string) => {
    const { error } = await updateOrderStatus(orderId, 'out_for_delivery', 'Order is out for delivery');
    if (error) { toast.error(error); } else { toast.success('Order marked as out for delivery'); loadOrders(); }
  };

  const handleReject = async () => {
    if (!selectedOrder || !rejectReason.trim()) return;
    setRejecting(true);
    const { error } = await rejectOrder(selectedOrder.id, rejectReason);
    if (error) { toast.error(error); }
    else { toast.success('Order rejected'); setShowRejectDialog(false); setRejectReason(''); loadOrders(); }
    setRejecting(false);
  };

  const handleBookingAction = async (itemId: string, status: 'confirmed' | 'declined') => {
    const { error } = await updateBookingStatus(itemId, status);
    if (error) { toast.error(error); }
    else { toast.success(`Booking ${status}`); loadOrders(); }
  };

  const handleSaveNotes = async () => {
    if (!selectedOrder) return;
    const { error } = await updateVendorOrderNotes(selectedOrder.id, vendorNotes);
    if (error) { toast.error(error); } else { toast.success('Notes saved'); }
  };

  if (loading) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </VendorDashboardLayout>
    );
  }

  const pendingCount = orders.filter(o => o.status === 'pending').length;

  return (
    <VendorDashboardLayout
      vendorName={vendor?.business_name || ''}
      isVerified={vendor?.is_verified || false}
      subscriptionStatus=""
    >
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage incoming orders and bookings.</p>
      </div>

      {/* Pending alert */}
      {pendingCount > 0 && (
        <Card className="mb-4 border-warning/30 bg-warning/5">
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-5 w-5 text-warning" />
            <p className="text-sm font-medium text-foreground">
              {pendingCount} {pendingCount === 1 ? 'order' : 'orders'} waiting for your acceptance
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList className="mb-6 flex flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="accepted">Accepted</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
          <TabsTrigger value="ready">Ready</TabsTrigger>
          <TabsTrigger value="out_for_delivery">On Delivery</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      {dataLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-foreground">No orders yet</p>
            <p className="mt-1 text-xs text-muted-foreground">When students place orders, they will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const statusInfo = ORDER_STATUS_LABELS[order.status] || ORDER_STATUS_LABELS.pending;
            const hasBookings = order.items?.some(i => i.booking_status) || false;

            return (
              <Card key={order.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{order.order_number}</p>
                        <Badge className={`text-xs ${
                          statusInfo.color === 'success' ? 'bg-success/10 text-success' :
                          statusInfo.color === 'warning' ? 'bg-warning/10 text-warning' :
                          statusInfo.color === 'error' ? 'bg-destructive/10 text-destructive' :
                          'bg-info/10 text-info'
                        }`}>
                          {statusInfo.label}
                        </Badge>
                        {hasBookings && <Badge className="bg-secondary/10 text-secondary text-xs">Booking</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>{order.buyer?.full_name || 'Student'}</span>
                        <span>GH₵{order.total_amount.toFixed(2)}</span>
                        <span className="flex items-center gap-1">
                          {order.delivery_method === 'delivery' ? <Truck className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                          {order.delivery_method === 'delivery' ? 'Delivery' : 'Pickup'}
                        </span>
                        <span>{new Date(order.created_at).toLocaleDateString('en-GH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {/* Items preview */}
                      <div className="mt-2 flex items-center gap-2">
                        {order.items?.slice(0, 3).map(item => {
                          const img = item.unit_image_url || item.product?.image_url || item.service?.image_url;
                          return (
                            <div key={item.id} className="h-8 w-8 overflow-hidden rounded border border-border bg-muted">
                              {img ? <img src={img} alt="" className="h-full w-full object-cover" /> :
                                <div className="flex h-full items-center justify-center text-muted-foreground/40">
                                  {item.service_id ? <Wrench className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                                </div>}
                            </div>
                          );
                        })}
                        {order.items && order.items.length > 3 && (
                          <span className="text-xs text-muted-foreground">+{order.items.length - 3} more</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => { setSelectedOrder(order); setVendorNotes(order.vendor_notes || ''); }}>
                        View details
                      </Button>
                      {order.status === 'pending' && (
                        <div className="flex gap-1.5">
                          <Button size="sm" className="h-7 text-xs" onClick={() => handleAccept(order.id)}>
                            <Check className="mr-1 h-3 w-3" /> Accept
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => { setSelectedOrder(order); setShowRejectDialog(true); }}>
                            <X className="mr-1 h-3 w-3" /> Reject
                          </Button>
                        </div>
                      )}
                      {order.status === 'accepted' && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => handleProcess(order.id)}>
                          Start processing
                        </Button>
                      )}
                      {order.status === 'processing' && order.delivery_method === 'pickup' && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => handleReady(order.id)}>
                          Mark ready
                        </Button>
                      )}
                      {order.status === 'processing' && order.delivery_method === 'delivery' && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => handleDeliver(order.id)}>
                          Out for delivery
                        </Button>
                      )}
                      {(order.status === 'ready' || order.status === 'out_for_delivery') && (
                        <span className="text-xs text-muted-foreground">Awaiting customer confirmation</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Order detail dialog */}
      {selectedOrder && !showRejectDialog && (
        <Dialog open={!!selectedOrder} onOpenChange={(open) => { if (!open) setSelectedOrder(null); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Order {selectedOrder.order_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Customer info */}
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-muted-foreground">Customer</p>
                <p className="mt-1 text-sm font-medium text-foreground">{selectedOrder.buyer?.full_name || 'Student'}</p>
                {selectedOrder.delivery_method === 'delivery' && selectedOrder.delivery_address && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedOrder.delivery_address.line1}, {selectedOrder.delivery_address.city}, {selectedOrder.delivery_address.region}
                  </p>
                )}
              </div>

              {/* Items */}
              <div className="space-y-2">
                {selectedOrder.items?.map(item => {
                  const name = item.unit_name || item.item_name || 'Item';
                  const img = item.unit_image_url || item.product?.image_url || item.service?.image_url;
                  return (
                    <div key={item.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 overflow-hidden rounded-lg bg-muted">
                          {img && <img src={img} alt={name} className="h-full w-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{name}</p>
                          <p className="text-xs text-muted-foreground">Qty: {item.quantity} × GH₵{item.unit_price}</p>
                        </div>
                        <p className="text-sm font-bold text-foreground">GH₵{(item.unit_price * item.quantity).toFixed(2)}</p>
                      </div>
                      {/* Booking details */}
                      {item.booking_status && (
                        <div className="mt-3 rounded-lg border border-secondary/20 bg-secondary/5 p-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-secondary" />
                              <span className="text-xs font-medium text-foreground">
                                {item.booking_date && new Date(item.booking_date).toLocaleDateString('en-GH')}
                                {item.booking_time && ` at ${item.booking_time}`}
                              </span>
                            </div>
                            <Badge className={`text-xs ${
                              BOOKING_STATUS_LABELS[item.booking_status]?.color === 'success' ? 'bg-success/10 text-success' :
                              BOOKING_STATUS_LABELS[item.booking_status]?.color === 'error' ? 'bg-destructive/10 text-destructive' :
                              'bg-warning/10 text-warning'
                            }`}>
                              {BOOKING_STATUS_LABELS[item.booking_status]?.label || item.booking_status}
                            </Badge>
                          </div>
                          {item.booking_notes && <p className="mt-1 text-xs text-muted-foreground">{item.booking_notes}</p>}
                          {item.booking_status === 'pending' && (
                            <div className="mt-2 flex gap-1.5">
                              <Button size="sm" className="h-6 text-xs" onClick={() => handleBookingAction(item.id, 'confirmed')}>
                                Confirm
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 text-xs text-destructive" onClick={() => handleBookingAction(item.id, 'declined')}>
                                Decline
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Vendor notes */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Internal notes (not visible to customer)</p>
                <Textarea rows={2} value={vendorNotes} onChange={e => setVendorNotes(e.target.value)} placeholder="Add notes about this order..." />
                <Button size="sm" variant="outline" onClick={handleSaveNotes}>Save notes</Button>
              </div>

              {/* Payment summary */}
              <div className="rounded-lg border border-border p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>GH₵{(selectedOrder.total_amount - selectedOrder.delivery_fee + selectedOrder.coupon_discount).toFixed(2)}</span></div>
                {selectedOrder.coupon_discount > 0 && <div className="flex justify-between text-success"><span>Discount</span><span>−GH₵{selectedOrder.coupon_discount.toFixed(2)}</span></div>}
                {selectedOrder.delivery_fee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>GH₵{selectedOrder.delivery_fee.toFixed(2)}</span></div>}
                <div className="border-t border-border pt-1 flex justify-between font-bold"><span>Total</span><span className="text-primary">GH₵{selectedOrder.total_amount.toFixed(2)}</span></div>
              </div>

              {/* Status actions */}
              {selectedOrder.status === 'pending' && (
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => { handleAccept(selectedOrder.id); setSelectedOrder(null); }}>
                    <Check className="mr-2 h-4 w-4" /> Accept order
                  </Button>
                  <Button variant="outline" className="flex-1 text-destructive" onClick={() => setShowRejectDialog(true)}>
                    <X className="mr-2 h-4 w-4" /> Reject
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Reject dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Please provide a reason for rejecting this order. The student will be notified.</p>
            <Textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejecting || !rejectReason.trim()}>
              {rejecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
              Reject order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </VendorDashboardLayout>
  );
}
