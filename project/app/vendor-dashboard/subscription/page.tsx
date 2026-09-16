'use client';

import { useState, useEffect } from 'react';
import { VendorDashboardLayout } from '@/components/vendor/vendor-dashboard-layout';
import { VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useVendor } from '@/hooks/use-vendor';
import { useAuth } from '@/lib/auth/auth-context';
import {
  getCurrentSubscription, initiateSubscriptionPayment,
  cancelSubscription, reactivateSubscription,
  getEnabledPaymentProviders, getPaymentMethodsForProvider,
} from '@/lib/data/payment-client';
import { SUBSCRIPTION_PLANS } from '@/lib/types/payment';
import type { PaymentProvider } from '@/lib/types/payment';
import type { Subscription } from '@/lib/types';
import { CreditCard, Check, Zap, Crown, Smartphone, Loader2, Calendar, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function SubscriptionPage() {
  return (
    <VendorRouteGuard>
      <Content />
    </VendorRouteGuard>
  );
}

function Content() {
  const { vendor } = useVendor();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'student_vendor' | 'external_vendor'>('student_vendor');
  const [selectedProvider, setSelectedProvider] = useState('manual');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [autoRenew, setAutoRenew] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (vendor?.id) loadData();
  }, [vendor?.id]);

  async function loadData() {
    setLoading(true);
    const [sub, provs] = await Promise.all([
      getCurrentSubscription(vendor!.id),
      getEnabledPaymentProviders(),
    ]);
    setSubscription(sub);
    setProviders(provs);
    setLoading(false);
  }

  const vendorType = vendor?.is_student_business ? 'student_vendor' : 'external_vendor';
  const currentPlan = SUBSCRIPTION_PLANS[vendorType as keyof typeof SUBSCRIPTION_PLANS];

  const handleSubscribe = (plan: 'student_vendor' | 'external_vendor') => {
    setSelectedPlan(plan);
    setShowPayment(true);
  };

  const handlePayment = async () => {
    if (!vendor?.id || !user) return;
    if (selectedProvider !== 'manual') {
      const prov = providers.find(p => p.name === selectedProvider);
      const methods = prov ? getPaymentMethodsForProvider(prov) : [];
      const method = methods.find(m => m.id === selectedMethod);
      if (method?.type === 'mobile_money' && !mobileNumber.trim()) {
        toast.error('Please enter your mobile money number');
        return;
      }
    }
    setProcessing(true);

    // Step 1: Initiate payment
    const { payment, error: initError } = await initiateSubscriptionPayment({
      vendorId: vendor.id,
      provider: selectedProvider,
      mobileNumber: selectedProvider !== 'manual' ? mobileNumber : undefined,
      mobileNetwork: selectedProvider !== 'manual' ? selectedMethod : undefined,
      autoRenew,
      idempotencyKey: crypto.randomUUID(),
    });

    if (initError || !payment) {
      toast.error(initError || 'Failed to initiate payment');
      setProcessing(false);
      return;
    }

    if (selectedProvider === 'manual') {
      toast.info('Payment is awaiting provider or staff confirmation. Your subscription is not active yet.');
      setShowPayment(false);
      setProcessing(false);
      loadData();
    } else {
      // For other providers, show "pending" state
      // In production, redirect to provider payment page here
      toast.info(`Payment initiated via ${selectedProvider}. You will be notified when payment is confirmed.`);
      setShowPayment(false);
      setProcessing(false);
      loadData();
    }
  };

  const handleCancelAutoRenew = async () => {
    if (!subscription) return;
    const { error } = await cancelSubscription(subscription.id);
    if (error) { toast.error(error); } else { toast.success('Auto-renew cancelled'); loadData(); }
  };

  const handleReactivate = async () => {
    if (!subscription) return;
    const { error } = await reactivateSubscription(subscription.id);
    if (error) { toast.error(error); } else { toast.success('Auto-renew reactivated'); loadData(); }
  };

  if (loading) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <div className="p-6 space-y-4 max-w-4xl">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 sm:grid-cols-2">{[1, 2].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>
        </div>
      </VendorDashboardLayout>
    );
  }

  const isActive = subscription?.status === 'active';
  const daysLeft = subscription?.ends_at ? Math.max(0, Math.ceil((new Date(subscription.ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  const isExpired = subscription && subscription.status !== 'active';
  const inGracePeriod = subscription?.grace_period_ends_at && new Date(subscription.grace_period_ends_at) > new Date();

  return (
    <VendorDashboardLayout vendorName={vendor?.business_name || ''} isVerified={vendor?.is_verified || false} subscriptionStatus={subscription?.status || 'none'}>
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" /> Subscription
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your vendor subscription plan</p>
      </div>

      {/* Current subscription status */}
      {subscription && (
        <Card className={isActive ? 'border-success/30' : 'border-destructive/30'}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">Current Plan: {subscription.plan === 'student_vendor' ? 'Student Vendor' : 'External Vendor'}</p>
                  <Badge className={isActive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}>{subscription.status}</Badge>
                </div>
                {subscription.ends_at && (
                  <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {isActive ? `${daysLeft} days remaining` : 'Expired'}
                    {subscription.ends_at && ` — ends ${new Date(subscription.ends_at).toLocaleDateString('en-GH')}`}
                  </p>
                )}
                {inGracePeriod && (
                  <p className="mt-1 text-xs text-warning">In grace period — subscribe to restore full access</p>
                )}
                {subscription.auto_renew !== null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Auto-renew: {subscription.auto_renew ? 'Enabled' : 'Disabled'}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {isActive && subscription.auto_renew && (
                  <Button size="sm" variant="outline" onClick={handleCancelAutoRenew}>
                    <X className="mr-1.5 h-3.5 w-3.5" /> Stop auto-renew
                  </Button>
                )}
                {isActive && !subscription.auto_renew && (
                  <Button size="sm" variant="outline" onClick={handleReactivate}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Enable auto-renew
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Student Vendor Plan */}
        <Card className={vendorType === 'student_vendor' ? 'border-primary/30' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Student Vendor</CardTitle>
              </div>
              {vendorType === 'student_vendor' && <Badge className="bg-primary/10 text-primary">Your plan</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">GH₵20<span className="text-sm font-normal text-muted-foreground">/month</span></p>
            <div className="mt-4 space-y-2">
              {SUBSCRIPTION_PLANS.student_vendor.features.map(f => (
                <div key={f} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <span className="text-sm text-foreground">{f}</span>
                </div>
              ))}
            </div>
            {vendorType === 'student_vendor' && (
              <Button className="w-full mt-4" onClick={() => handleSubscribe('student_vendor')}>
                {isActive ? 'Renew subscription' : 'Subscribe now'}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* External Vendor Plan */}
        <Card className={vendorType === 'external_vendor' ? 'border-primary/30' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-accent" />
                <CardTitle className="text-lg">External Vendor</CardTitle>
              </div>
              {vendorType === 'external_vendor' && <Badge className="bg-accent/10 text-accent">Your plan</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">GH₵50<span className="text-sm font-normal text-muted-foreground">/month</span></p>
            <div className="mt-4 space-y-2">
              {SUBSCRIPTION_PLANS.external_vendor.features.map(f => (
                <div key={f} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <span className="text-sm text-foreground">{f}</span>
                </div>
              ))}
            </div>
            {vendorType === 'external_vendor' && (
              <Button className="w-full mt-4" onClick={() => handleSubscribe('external_vendor')}>
                {isActive ? 'Renew subscription' : 'Subscribe now'}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Subscribe — {SUBSCRIPTION_PLANS[selectedPlan].name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium">{SUBSCRIPTION_PLANS[selectedPlan].name}</span></div>
              <div className="flex justify-between mt-1"><span className="text-muted-foreground">Amount</span><span className="font-medium">GH₵{SUBSCRIPTION_PLANS[selectedPlan].price}.00</span></div>
              <div className="flex justify-between mt-1"><span className="text-muted-foreground">Billing</span><span className="font-medium">Monthly</span></div>
            </div>

            {/* Provider selection */}
            <div className="space-y-1.5">
              <Label>Payment Provider</Label>
              <Select value={selectedProvider} onValueChange={v => { setSelectedProvider(v); setSelectedMethod(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providers.map(p => (
                    <SelectItem key={p.name} value={p.name}>{p.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic payment methods per provider */}
            {selectedProvider !== 'manual' && (() => {
              const prov = providers.find(p => p.name === selectedProvider);
              const methods = prov ? getPaymentMethodsForProvider(prov) : [];
              const selectedMethodObj = methods.find(m => m.id === selectedMethod);
              const isMobileMoney = selectedMethodObj?.type === 'mobile_money';
              return (
                <>
                  <div className="space-y-1.5">
                    <Label>Payment Method</Label>
                    <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                      <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                      <SelectContent>
                        {methods.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {isMobileMoney && (
                    <div className="space-y-1.5">
                      <Label>Mobile Money Number</Label>
                      <Input placeholder="024 XXX XXXX" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} />
                    </div>
                  )}
                </>
              );
            })()}

            {/* Auto-renew toggle */}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoRenew} onChange={e => setAutoRenew(e.target.checked)} />
              Enable auto-renewal (automatic monthly renewal)
            </label>

            <div className="rounded-lg bg-info/5 border border-info/20 p-3 text-xs text-info">
              <Smartphone className="inline h-3.5 w-3.5 mr-1" />
              {selectedProvider === 'manual'
                ? 'Manual payment: Your subscription will be activated immediately. An admin will verify the payment reference.'
                : selectedMethod
                  ? `You will be prompted to confirm the GH₵${SUBSCRIPTION_PLANS[selectedPlan].price} payment via ${selectedMethod.replace(/_/g, ' ')}.`
                  : 'Select a payment method to continue.'}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayment(false)}>Cancel</Button>
            <Button disabled={processing} onClick={handlePayment}>
              {processing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : <>Pay GH₵{SUBSCRIPTION_PLANS[selectedPlan].price}.00</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </VendorDashboardLayout>
  );
}
