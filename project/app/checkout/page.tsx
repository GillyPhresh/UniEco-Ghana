'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth/auth-context';
import {
  getCartItems, calculateCartSummary, createOrder, clearCartItems,
} from '@/lib/data/marketplace-client';
import {
  getEnabledPaymentProviders, getPaymentMethodsForProvider,
  initiateMarketplacePayment,
} from '@/lib/data/payment-client';
import type { PaymentProvider } from '@/lib/types/payment';
import { supabase } from '@/lib/supabase/client';
import type { CartItem } from '@/lib/types/marketplace';
import type { DeliveryMethod } from '@/lib/types';
import { regions } from '@/lib/validation';
import {
  Truck, Store, ArrowRight, ArrowLeft, Check, Loader2,
  Image as ImageIcon, Wrench, ShoppingCart, CreditCard, Smartphone,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNetworkStatus } from '@/hooks/use-network-status';

export default function CheckoutPage() {
  return (
    <>
      <SiteHeader />
      <CheckoutContent />
      <SiteFooter />
    </>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [step, setStep] = useState(1);
  const [vendorDeliveryAvailable, setVendorDeliveryAvailable] = useState(false);

  const [form, setForm] = useState({
    deliveryMethod: 'pickup' as DeliveryMethod,
    addressLine1: '',
    city: '',
    region: '',
    landmark: '',
    deliveryInstructions: '',
    contactPhone: '',
    orderNotes: '',
  });

  // Booking fields for service items
  const [bookingForm, setBookingForm] = useState<Record<string, { date: string; time: string; notes: string }>>({});
  const [paymentProviders, setPaymentProviders] = useState<PaymentProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('manual');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');

  useEffect(() => {
    if (!user) { if (!authLoading) setLoading(false); return; }
    loadCart();
    loadProviders();
  }, [user, authLoading]);

  async function loadProviders() {
    const provs = await getEnabledPaymentProviders();
    setPaymentProviders(provs);
  }

  async function loadCart() {
    setLoading(true);
    const data = await getCartItems();
    const active = data.filter(i => !i.save_for_later);
    setItems(active);

    if (active.length > 0) {
      // Get vendor info from first item's business
      const firstBusinessId = active[0].product?.business_id || active[0].service?.business_id;
      if (firstBusinessId) {
        const { data: business } = await supabase
          .from('businesses')
          .select('vendor:vendors(id, university_id, delivery_available)')
          .eq('id', firstBusinessId)
          .maybeSingle();

        if (business?.vendor) {
          const v = (Array.isArray(business.vendor) ? business.vendor[0] : business.vendor) as { id: string; university_id: string | null; delivery_available: boolean };
          if (v) {
            setVendorDeliveryAvailable(v.delivery_available);
          }
        }
      }

      // Pre-fill contact phone
      if (user?.profile?.phone) {
        setForm(prev => ({ ...prev, contactPhone: user.profile?.phone || '' }));
      }

      // Initialize booking form for service items
      const bookings: Record<string, { date: string; time: string; notes: string }> = {};
      active.forEach(item => {
        if (item.service_id) {
          bookings[item.id] = { date: '', time: '', notes: '' };
        }
      });
      setBookingForm(bookings);
    }

    setLoading(false);
  }

  // The database calculates any delivery fee during secure checkout.
  const summary = calculateCartSummary(items, form.deliveryMethod, 0);
  const hasServiceItems = items.some(i => i.service_id);
  const hasProductItems = items.some(i => i.product_id);

  const canProceedFromStep1 = () => {
    if (form.deliveryMethod === 'delivery') {
      return form.addressLine1 && form.city && form.region && form.contactPhone;
    }
    return form.contactPhone || true;
  };

  const canProceedFromStep2 = () => {
    // Validate booking details for service items
    for (const item of items) {
      if (item.service_id) {
        const booking = bookingForm[item.id];
        if (!booking?.date || !booking?.time) return false;
      }
    }
    return true;
  };

  const { online } = useNetworkStatus();

  const handlePlaceOrder = async () => {
    if (!user) { toast.error('Please sign in to checkout'); return; }
    if (!online) { toast.error('You are offline. Please reconnect before placing your order.'); return; }

    setPlacing(true);

    // Only item IDs, quantity, and booking preferences leave the browser.
    // The database derives vendor, price, stock, discount, delivery fee, and total.
    const orderItems = items.map(item => {
      const booking = item.service_id ? bookingForm[item.id] : null;

      return {
        product_id: item.product_id || undefined,
        service_id: item.service_id || undefined,
        quantity: item.quantity,
        booking_date: booking?.date,
        booking_time: booking?.time,
        booking_notes: booking?.notes,
      };
    });

    const { data: order, error } = await createOrder({
      items: orderItems,
      delivery_method: form.deliveryMethod,
      delivery_address: form.deliveryMethod === 'delivery' ? {
        line1: form.addressLine1,
        city: form.city,
        region: form.region,
        landmark: form.landmark,
        instructions: form.deliveryInstructions,
      } : undefined,
      delivery_instructions: form.deliveryInstructions || undefined,
      notes: form.orderNotes || undefined,
      idempotency_key: crypto.randomUUID(),
    });

    if (error || !order) {
      toast.error(error || 'Could not place order. Please try again.');
      setPlacing(false);
      return;
    }

    // Clear cart
    await clearCartItems();

    // Request a payment intent using the server-calculated order total.
    if (selectedProvider === 'manual') {
      const { error: payError } = await initiateMarketplacePayment({
        orderId: order.id,
        provider: 'manual',
        idempotencyKey: crypto.randomUUID(),
      });
      if (payError) {
        toast.error(payError);
        setPlacing(false);
        return;
      }
      toast.info('Order placed. Cash on delivery is awaiting collection; it has not been marked as paid.');
    } else {
      // Online payment — initiate and await provider confirmation
      const prov = paymentProviders.find(p => p.name === selectedProvider);
      const methodObj = prov ? getPaymentMethodsForProvider(prov).find(m => m.id === selectedMethod) : null;
      const { error: payError } = await initiateMarketplacePayment({
        orderId: order.id,
        provider: selectedProvider,
        mobileNumber: methodObj?.type === 'mobile_money' ? mobileNumber : undefined,
        mobileNetwork: methodObj?.type === 'mobile_money' ? selectedMethod : undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      if (payError) {
        toast.error(`Order placed, but payment could not be initiated: ${payError}`);
        setPlacing(false);
        return;
      }
      toast.info('Order placed. Payment remains pending until the provider confirms it.');
    }

    toast.success('Order created successfully.');
    router.push(`/orders/${order.id}`);
  };

  const offlineWarning = !online && (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>You are offline. You can review your cart, but checkout requires an internet connection.</span>
    </div>
  );

  if (authLoading || loading) {
    return (
      <main className="container max-w-3xl py-6 sm:py-8 px-4 sm:px-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-6 h-96 rounded-xl" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="container max-w-3xl py-6 sm:py-8 px-4 sm:px-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Please sign in to checkout.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="container max-w-3xl py-6 sm:py-8 px-4 sm:px-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingCart className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg font-semibold text-foreground">Your cart is empty</p>
            <Button asChild className="mt-4"><a href="/marketplace">Browse marketplace</a></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="container max-w-3xl py-6 sm:py-8 px-4 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-foreground mb-6">Checkout</h1>

      {offlineWarning}

      {/* Steps indicator */}
      <div className="mb-8 flex items-center gap-2">
        {[
          { num: 1, label: 'Delivery' },
          { num: 2, label: hasServiceItems ? 'Booking' : 'Review' },
          { num: 3, label: 'Payment' },
          { num: 4, label: 'Confirm' },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
              step >= s.num ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              {step > s.num ? <Check className="h-3.5 w-3.5" /> : s.num}
            </div>
            <span className={`text-xs ${step >= s.num ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
            {i < 3 && <div className={`h-0.5 w-8 ${step > s.num ? 'bg-primary' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          {/* Step 1: Delivery */}
          {step === 1 && (
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-foreground">Delivery Method</h2>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => setForm(p => ({ ...p, deliveryMethod: 'pickup' }))}
                    className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
                      form.deliveryMethod === 'pickup' ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <Store className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Pickup</p>
                      <p className="text-xs text-muted-foreground">Pick up from the vendor&apos;s location</p>
                      <p className="mt-1 text-xs text-success font-medium">No delivery fee</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setForm(p => ({ ...p, deliveryMethod: 'delivery' }))}
                    disabled={!vendorDeliveryAvailable}
                    className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors disabled:opacity-50 ${
                      form.deliveryMethod === 'delivery' ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <Truck className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Delivery</p>
                      <p className="text-xs text-muted-foreground">Get it delivered to you</p>
                      <p className="mt-1 text-xs text-muted-foreground font-medium">GH₵10.00 delivery fee</p>
                    </div>
                  </button>
                </div>

                {form.deliveryMethod === 'delivery' && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <h3 className="text-sm font-semibold text-foreground">Delivery Address</h3>
                    <div className="space-y-2">
                      <Label htmlFor="addr1">Address line</Label>
                      <Input id="addr1" value={form.addressLine1} onChange={e => setForm(p => ({ ...p, addressLine1: e.target.value }))} placeholder="Hostel name, room number, street" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="city">City/Town</Label>
                        <Input id="city" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="e.g. Sunyani" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="region">Region</Label>
                        <Select value={form.region} onValueChange={v => setForm(p => ({ ...p, region: v }))}>
                          <SelectTrigger id="region"><SelectValue placeholder="Select region" /></SelectTrigger>
                          <SelectContent>
                            {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="landmark">Landmark (optional)</Label>
                      <Input id="landmark" value={form.landmark} onChange={e => setForm(p => ({ ...p, landmark: e.target.value }))} placeholder="Nearby landmark for easy navigation" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="deliv_instr">Delivery instructions (optional)</Label>
                      <Textarea id="deliv_instr" rows={2} value={form.deliveryInstructions} onChange={e => setForm(p => ({ ...p, deliveryInstructions: e.target.value }))} placeholder="Any specific instructions for the delivery..." />
                    </div>
                  </div>
                )}

                <div className="space-y-2 border-t border-border pt-4">
                  <Label htmlFor="phone">Contact phone number</Label>
                  <Input id="phone" value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} placeholder="0244 123 456" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Order notes (optional)</Label>
                  <Textarea id="notes" rows={2} value={form.orderNotes} onChange={e => setForm(p => ({ ...p, orderNotes: e.target.value }))} placeholder="Any special requests for this order..." />
                </div>

                <Button onClick={() => setStep(2)} disabled={!canProceedFromStep1()} className="w-full">
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Booking details or Review */}
          {step === 2 && (
            <Card>
              <CardContent className="p-6 space-y-4">
                {hasServiceItems ? (
                  <>
                    <h2 className="font-display text-lg font-bold text-foreground">Service Booking Details</h2>
                    <p className="text-sm text-muted-foreground">Choose your preferred date and time for each service.</p>
                    {items.filter(i => i.service_id).map(item => {
                      const name = item.service?.name || 'Service';
                      return (
                        <div key={item.id} className="rounded-xl border border-border p-4 space-y-3">
                          <p className="text-sm font-medium text-foreground">{name}</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Preferred date</Label>
                              <Input type="date" min={new Date().toISOString().split('T')[0]} value={bookingForm[item.id]?.date || ''} onChange={e => setBookingForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], date: e.target.value } }))} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Preferred time</Label>
                              <Input type="time" value={bookingForm[item.id]?.time || ''} onChange={e => setBookingForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], time: e.target.value } }))} />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Notes (optional)</Label>
                            <Input value={bookingForm[item.id]?.notes || ''} onChange={e => setBookingForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], notes: e.target.value } }))} placeholder="Any specific requirements..." />
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <>
                    <h2 className="font-display text-lg font-bold text-foreground">Review Your Order</h2>
                    <div className="space-y-2">
                      {items.map(item => {
                        const name = item.product?.name || item.service?.name || 'Unknown';
                        const price = item.product?.discount_price || item.product?.price || item.service?.price || 0;
                        const image = item.product?.image_url || item.service?.image_url || null;
                        return (
                          <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                              {image && <img src={image} alt={name} className="h-full w-full object-cover" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{name}</p>
                              <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                            </div>
                            <p className="text-sm font-bold text-foreground">GH₵{(price * item.quantity).toFixed(2)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={() => setStep(3)} disabled={!canProceedFromStep2()} className="flex-1">
                    Payment <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Payment */}
          {step === 3 && (
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" /> Payment Method
                </h2>
                <p className="text-sm text-muted-foreground">Select how you want to pay for your order</p>

                {/* Provider selection */}
                <div className="space-y-2">
                  {paymentProviders.map(p => (
                    <button
                      key={p.name}
                      onClick={() => { setSelectedProvider(p.name); setSelectedMethod(''); }}
                      className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                        selectedProvider === p.name ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      {p.supported_methods.includes('mtn_momo') ? <Smartphone className="h-5 w-5 text-primary" /> : <CreditCard className="h-5 w-5 text-primary" />}
                      <div>
                        <p className="text-sm font-medium text-foreground">{p.display_name}</p>
                        <p className="text-xs text-muted-foreground">{p.supported_methods.length} methods</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Dynamic payment methods */}
                {selectedProvider !== 'manual' && (() => {
                  const prov = paymentProviders.find(p => p.name === selectedProvider);
                  const methods = prov ? getPaymentMethodsForProvider(prov) : [];
                  const selectedMethodObj = methods.find(m => m.id === selectedMethod);
                  const isMobileMoney = selectedMethodObj?.type === 'mobile_money';
                  return (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Select method</label>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {methods.map(m => (
                            <button
                              key={m.id}
                              onClick={() => setSelectedMethod(m.id)}
                              className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors ${
                                selectedMethod === m.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                              }`}
                            >
                              {m.type === 'mobile_money' ? <Smartphone className="h-4 w-4 text-primary" /> : <CreditCard className="h-4 w-4 text-primary" />}
                              <span className="text-foreground">{m.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      {isMobileMoney && (
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-foreground">Mobile Money Number</label>
                          <Input placeholder="024 XXX XXXX" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} />
                        </div>
                      )}
                    </>
                  );
                })()}

                {selectedProvider === 'manual' && (
                  <div className="rounded-lg bg-info/5 border border-info/20 p-3 text-sm text-info">
                    <Smartphone className="inline h-4 w-4 mr-1" />
                    Pay with cash on delivery or bank transfer. Your order will be confirmed once payment is verified.
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={() => setStep(4)} className="flex-1">
                    Review order <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-foreground">Confirm Your Order</h2>

                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2">
                    {form.deliveryMethod === 'delivery' ? <Truck className="h-4 w-4 text-primary" /> : <Store className="h-4 w-4 text-primary" />}
                    <p className="text-sm font-semibold text-foreground">
                      {form.deliveryMethod === 'delivery' ? 'Delivery' : 'Pickup'}
                    </p>
                  </div>
                  {form.deliveryMethod === 'delivery' && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {form.addressLine1}, {form.city}, {form.region}
                      {form.landmark && ` — ${form.landmark}`}
                    </p>
                  )}
                  {form.contactPhone && <p className="mt-1 text-xs text-muted-foreground">Phone: {form.contactPhone}</p>}
                </div>

                <div className="space-y-2">
                  {items.map(item => {
                    const name = item.product?.name || item.service?.name || 'Unknown';
                    const price = item.product?.discount_price || item.product?.price || item.service?.price || 0;
                    const image = item.product?.image_url || item.service?.image_url || null;
                    const booking = item.service_id ? bookingForm[item.id] : null;
                    return (
                      <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {image && <img src={image} alt={name} className="h-full w-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{name}</p>
                          <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                          {booking?.date && <p className="text-xs text-primary">Booked: {booking.date} at {booking.time}</p>}
                        </div>
                        <p className="text-sm font-bold text-foreground">GH₵{(price * item.quantity).toFixed(2)}</p>
                      </div>
                    );
                  })}
                </div>

                {form.orderNotes && (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold text-foreground">Order notes</p>
                    <p className="mt-1 text-xs text-muted-foreground">{form.orderNotes}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(3)} className="flex-1">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={handlePlaceOrder} disabled={placing} className="flex-1" size="lg">
                    {placing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    {placing ? 'Placing order...' : `Place order — GH₵${summary.total.toFixed(2)}+`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Summary sidebar */}
        <div>
          <Card className="sticky top-20">
            <CardContent className="p-5 space-y-3">
              <h2 className="font-display text-base font-bold text-foreground">Summary</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">GH₵{summary.subtotal.toFixed(2)}</span>
                </div>
                {summary.discount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Discount</span>
                    <span>−GH₵{summary.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery fee</span>
                  <span className="font-medium">{form.deliveryMethod === 'delivery' ? 'Calculated securely at checkout' : 'Free'}</span>
                </div>
              </div>
              <div className="border-t border-border pt-3 flex justify-between">
                <span className="font-semibold text-foreground">Total</span>
                <span className="font-bold text-primary text-lg">
                  GH₵{summary.total.toFixed(2)}{form.deliveryMethod === 'delivery' ? '+' : ''}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedProvider === 'manual'
                  ? 'Payment will be collected on delivery/pickup.'
                  : selectedMethod
                    ? `Payment via ${selectedMethod.replace(/_/g, ' ')} — you will be prompted to confirm payment.`
                    : 'Select a payment method to continue.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
