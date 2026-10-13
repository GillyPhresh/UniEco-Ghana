'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/auth-context';
import {
  getOrderById, getOrderStatusHistory, cancelOrder, generateReceipt,
  getOrderMessages, sendOrderMessage, markOrderMessagesRead, confirmOrderHandoff,
} from '@/lib/data/marketplace-client';
import { ORDER_STATUS_LABELS, BOOKING_STATUS_LABELS } from '@/lib/types/marketplace';
import type { OrderWithDetails, OrderStatusHistory, OrderMessage } from '@/lib/types/marketplace';
import {
  Package, ArrowLeft, Truck, Store, Check, X, Clock,
  Download, Send, MessageSquare, MapPin, Phone, FileText,
  Image as ImageIcon, Wrench, Loader2, CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <>
      <SiteHeader />
      <OrderDetailContent orderId={id} />
      <SiteFooter />
    </>
  );
}

function OrderDetailContent({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderWithDetails | null>(null);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [generatingReceipt, setGeneratingReceipt] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmingHandoff, setConfirmingHandoff] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  async function loadOrder() {
    setLoading(true);
    const [o, h, m] = await Promise.all([
      getOrderById(orderId),
      getOrderStatusHistory(orderId),
      getOrderMessages(orderId),
    ]);
    setOrder(o);
    setHistory(h);
    setMessages(m);
    if (user) await markOrderMessagesRead(orderId);
    setLoading(false);
  }

  const handleCancel = async () => {
    if (!cancelReason.trim()) { toast.error('Please provide a reason'); return; }
    setCancelling(true);
    const { error } = await cancelOrder(orderId, cancelReason);
    if (error) { toast.error(error); }
    else {
      toast.success('Order cancelled');
      setShowCancelDialog(false);
      loadOrder();
    }
    setCancelling(false);
  };

  const handleDownloadReceipt = async () => {
    setGeneratingReceipt(true);
    const { data, error } = await generateReceipt(orderId);
    if (error || !data) {
      toast.error('Could not generate receipt: ' + (error || 'Unknown error'));
    } else {
      const html = generateReceiptHtml(data.data, order);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (w) { setTimeout(() => w.print(), 500); }
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    setGeneratingReceipt(false);
  };

  const handleSendMessage = async () => {
    if (!messageBody.trim() || !order) return;
    const recipientId = order.vendor?.owner_id || '';
    const { error } = await sendOrderMessage(orderId, recipientId, messageBody.trim());
    if (error) { toast.error(error); }
    else { setMessageBody(''); loadOrder(); }
  };

  const handleConfirmHandoff = async () => {
    setConfirmingHandoff(true);
    const { error } = await confirmOrderHandoff(orderId);
    if (error) toast.error(error);
    else { toast.success('Order completion confirmed'); loadOrder(); }
    setConfirmingHandoff(false);
  };

  if (loading) {
    return (
      <main className="container max-w-3xl py-6 sm:py-8 px-4 sm:px-6">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-4 h-96 rounded-xl" />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="container max-w-3xl py-6 sm:py-8 px-4 sm:px-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg font-semibold text-foreground">Order not found</p>
            <Button asChild className="mt-4"><Link href="/orders">View all orders</Link></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const statusInfo = ORDER_STATUS_LABELS[order.status] || ORDER_STATUS_LABELS.pending;
  const canCancel = ['pending', 'accepted'].includes(order.status);
  const isCompleted = order.status === 'completed';

  return (
    <main className="container max-w-3xl py-6 sm:py-8 px-4 sm:px-6">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> All orders
      </Link>

      {/* Header */}
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-foreground">{order.order_number}</h1>
            <Badge className={`text-xs ${
              statusInfo.color === 'success' ? 'bg-success/10 text-success' :
              statusInfo.color === 'warning' ? 'bg-warning/10 text-warning' :
              statusInfo.color === 'error' ? 'bg-destructive/10 text-destructive' :
              'bg-info/10 text-info'
            }`}>
              {statusInfo.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Placed on {new Date(order.created_at).toLocaleDateString('en-GH', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          {isCompleted && (
            <Button variant="outline" size="sm" onClick={handleDownloadReceipt} disabled={generatingReceipt}>
              {generatingReceipt ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
              Receipt
            </Button>
          )}
          {canCancel && (
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setShowCancelDialog(true)}>
              <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
            </Button>
          )}
          {['ready', 'out_for_delivery'].includes(order.status) && (
            <Button size="sm" onClick={handleConfirmHandoff} disabled={confirmingHandoff}>
              {confirmingHandoff ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="mr-1.5 h-3.5 w-3.5" />}
              Confirm {order.delivery_method === 'delivery' ? 'delivery' : 'pickup'}
            </Button>
          )}
        </div>
      </div>

      {/* Status timeline */}
      <Card className="mt-6">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Order Timeline</h2>
          <div className="space-y-4">
            {history.map((h, i) => {
              const info = ORDER_STATUS_LABELS[h.new_status as keyof typeof ORDER_STATUS_LABELS] || { label: h.new_status, color: 'muted' };
              const isLast = i === history.length - 1;
              return (
                <div key={h.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      info.color === 'success' ? 'bg-success/10 text-success' :
                      info.color === 'warning' ? 'bg-warning/10 text-warning' :
                      info.color === 'error' ? 'bg-destructive/10 text-destructive' :
                      'bg-info/10 text-info'
                    }`}>
                      {h.new_status === 'completed' ? <CheckCircle className="h-4 w-4" /> :
                       h.new_status === 'cancelled' ? <X className="h-4 w-4" /> :
                       <Clock className="h-4 w-4" />}
                    </div>
                    {!isLast && <div className="h-full w-0.5 bg-border mt-1" />}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="text-sm font-medium text-foreground">{info.label}</p>
                    {h.note && <p className="text-xs text-muted-foreground mt-0.5">{h.note}</p>}
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {new Date(h.created_at).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {/* Items */}
        <div>
          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">Items</h2>
              <div className="space-y-3">
                {order.items?.map(item => {
                  const name = item.unit_name || item.item_name || item.product?.name || item.service?.name || 'Item';
                  const image = item.unit_image_url || item.product?.image_url || item.service?.image_url || null;
                  return (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                        {image ? <img src={image} alt={name} className="h-full w-full object-cover" /> :
                          <div className="flex h-full items-center justify-center text-muted-foreground/40">
                            {item.service_id ? <Wrench className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                          </div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{name}</p>
                        <p className="text-xs text-muted-foreground">Qty: {item.quantity} × GH₵{item.unit_price}</p>
                        {item.booking_status && (
                          <Badge className="mt-1 text-xs {
                            BOOKING_STATUS_LABELS[item.booking_status]?.color === 'success' ? 'bg-success/10 text-success' :
                            BOOKING_STATUS_LABELS[item.booking_status]?.color === 'error' ? 'bg-destructive/10 text-destructive' :
                            'bg-warning/10 text-warning'
                          }">
                            {BOOKING_STATUS_LABELS[item.booking_status]?.label || item.booking_status}
                          </Badge>
                        )}
                        {item.booking_date && (
                          <p className="text-xs text-primary mt-0.5">
                            Booked: {item.booking_date}{item.booking_time ? ` at ${item.booking_time}` : ''}
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-bold text-foreground">GH₵{(item.unit_price * item.quantity).toFixed(2)}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Order info */}
        <div className="space-y-4">
          {/* Delivery */}
          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">Delivery Details</h2>
              <div className="flex items-center gap-2 text-sm">
                {order.delivery_method === 'delivery' ? <Truck className="h-4 w-4 text-primary" /> : <Store className="h-4 w-4 text-primary" />}
                <span className="font-medium text-foreground capitalize">{order.delivery_method}</span>
              </div>
              {order.delivery_method === 'delivery' && order.delivery_address && (
                <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>
                    {order.delivery_address.line1}<br />
                    {order.delivery_address.city}, {order.delivery_address.region}
                    {order.delivery_address.landmark && <><br />Landmark: {order.delivery_address.landmark}</>}
                  </p>
                </div>
              )}
              {order.delivery_instructions && (
                <p className="mt-2 text-xs text-muted-foreground italic">Instructions: {order.delivery_instructions}</p>
              )}
            </CardContent>
          </Card>

          {/* Vendor info */}
          {order.vendor && (
            <Card>
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3">Vendor</h2>
                <Link href={`/business/${order.vendor.business_slug}`} className="flex items-center gap-3">
                  {order.vendor.logo_url ? (
                    <img src={order.vendor.logo_url} alt={order.vendor.business_name} className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Store className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{order.vendor.business_name}</p>
                    <p className="text-xs text-muted-foreground">View business</p>
                  </div>
                </Link>
                {order.vendor.contact_phone && (
                  <a href={`tel:${order.vendor.contact_phone}`} className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> {order.vendor.contact_phone}
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {/* Payment summary */}
          <Card>
            <CardContent className="p-5 space-y-2 text-sm">
              <h2 className="text-sm font-semibold text-foreground mb-2">Payment Summary</h2>
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>GH₵{(order.total_amount - order.delivery_fee + order.coupon_discount).toFixed(2)}</span></div>
              {order.coupon_discount > 0 && <div className="flex justify-between text-success"><span>Discount</span><span>−GH₵{order.coupon_discount.toFixed(2)}</span></div>}
              {order.delivery_fee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span>GH₵{order.delivery_fee.toFixed(2)}</span></div>}
              <div className="border-t border-border pt-2 flex justify-between font-bold">
                <span className="text-foreground">Total</span>
                <span className="text-primary">GH₵{order.total_amount.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Order messages */}
      <Card className="mt-6">
        <CardContent className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
            <MessageSquare className="h-4 w-4 text-primary" /> Messages
          </h2>
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">No messages yet. Start a conversation about this order.</p>
            ) : (
              messages.map(msg => {
                const isMine = msg.sender_id === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                      isMine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    }`}>
                      <p className="text-sm">{msg.body}</p>
                      <p className={`mt-1 text-xs ${isMine ? 'text-primary-foreground/60' : 'text-muted-foreground/70'}`}>
                        {new Date(msg.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Input
              placeholder="Type a message..."
              value={messageBody}
              onChange={e => setMessageBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSendMessage(); }}
            />
            <Button size="icon" onClick={handleSendMessage} disabled={!messageBody.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cancel dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <h3 className="font-semibold text-foreground">Cancel this order?</h3>
              <p className="text-sm text-muted-foreground">Please tell us why you&apos;re cancelling this order.</p>
              <Textarea rows={3} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Reason for cancellation..." />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowCancelDialog(false)}>Keep order</Button>
                <Button variant="destructive" className="flex-1" onClick={handleCancel} disabled={cancelling || !cancelReason.trim()}>
                  {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                  Cancel order
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}

function generateReceiptHtml(data: Record<string, unknown>, order: OrderWithDetails | null): string {
  const items = (data.items as Array<Record<string, unknown>>) || [];
  const itemsHtml = items.map(i => `
    <tr>
      <td>${i.name}</td>
      <td style="text-align:center;">${i.quantity}</td>
      <td style="text-align:right;">GH₵${Number(i.unit_price).toFixed(2)}</td>
      <td style="text-align:right;">GH₵${Number(i.subtotal).toFixed(2)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><title>Receipt ${data.receipt_number || ''}</title>
<style>
body{font-family:Arial,sans-serif;margin:40px;color:#1a1a1a}
.header{display:flex;justify-content:space-between;border-bottom:2px solid #0a7c5a;padding-bottom:20px}
.logo{font-size:24px;font-weight:bold;color:#0a7c5a}
table{width:100%;border-collapse:collapse;margin:20px 0}
th{text-align:left;padding:10px;border-bottom:2px solid #ddd;color:#666;font-size:12px;text-transform:uppercase}
td{padding:10px;border-bottom:1px solid #eee;font-size:14px}
.total{text-align:right;font-size:20px;font-weight:bold;margin-top:20px}
.footer{margin-top:60px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center}
@media print{body{margin:20px}}
</style></head><body>
<div class="header">
<div><div class="logo">UniEco Ghana</div><p style="color:#666;font-size:13px;margin-top:5px">Campus Business Ecosystem</p></div>
<div style="text-align:right"><div style="font-size:18px;font-weight:bold">RECEIPT</div><div style="color:#666;font-size:13px">${data.receipt_number || ''}</div></div>
</div>
<p><strong>Order:</strong> ${data.order_number || order?.order_number || ''}<br/>
<strong>Vendor:</strong> ${data.vendor_name || order?.vendor?.business_name || ''}<br/>
<strong>Customer:</strong> ${data.buyer_name || ''}<br/>
<strong>Date:</strong> ${new Date(data.date as string || order?.created_at || '').toLocaleDateString('en-GH')}</p>
<table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
<tbody>${itemsHtml}</tbody></table>
<p>Subtotal: GH₵${Number(data.subtotal || 0).toFixed(2)}</p>
${Number(data.discount) > 0 ? `<p style="color:#0a7c5a">Discount: −GH₵${Number(data.discount).toFixed(2)}</p>` : ''}
${Number(data.delivery_fee) > 0 ? `<p>Delivery: GH₵${Number(data.delivery_fee).toFixed(2)}</p>` : ''}
<div class="total">Total: GH₵${Number(data.total || order?.total_amount || 0).toFixed(2)}</div>
<div class="footer">UniEco Ghana — Thank you for your purchase!<br/>This is a computer-generated receipt.</div>
</body></html>`;
}
