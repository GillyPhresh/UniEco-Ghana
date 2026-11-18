'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, CalendarDays, CreditCard, FileText, History, Loader2, RefreshCw, ShieldCheck, Store, TriangleAlert,
} from 'lucide-react';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useVendor } from '@/hooks/use-vendor';
import { startPaystackCheckout } from '@/lib/data/payment-client';
import { createIdempotencyKey } from '@/lib/utils/idempotency';
import {
  vendorSubscriptionCoverage, vendorSubscriptionPlans, type VendorSubscriptionSnapshot,
} from '@/lib/payments/vendor-subscription';

const ghDate = new Intl.DateTimeFormat('en-GH', { dateStyle: 'long', timeZone: 'Africa/Accra' });
const support = 'mailto:support@uniecoghana.com';
const checkPayment = (reference: string) => '/payments/callback?' + new URLSearchParams({ reference, flow: 'subscription' }).toString();

export default function SubscriptionPage() {
  return <VendorRouteGuard><Content /></VendorRouteGuard>;
}

function Content() {
  const { vendor, loading, error, reload } = useVendor();
  return <VendorDashboardLayout vendorName={vendor?.business_name || 'Your business'} isVerified={Boolean(vendor?.is_verified)} subscriptionStatus="">
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6">
      <header className="rounded-3xl border bg-gradient-to-br from-primary/15 via-card to-card p-5 sm:p-8">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary"><Store className="h-4 w-4" aria-hidden /> Vendor billing</span>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Business subscription</h1>
        <p className="mt-2 text-sm text-muted-foreground">Check your plan, renew it, and find your payment records.</p>
      </header>
      {loading ? <Skeleton className="h-56 w-full rounded-2xl" />
        : error || !vendor ? <div className="rounded-2xl border bg-card p-5" role="alert">
          <p>{error ? 'We couldn’t load your business account.' : 'No linked business account was found.'}</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => void reload()}>Try again</Button>
        </div> : <BillingPanel key={vendor.id} vendorId={vendor.id} />}
      <nav aria-label="Billing records" className="grid gap-2 sm:grid-cols-2">
        <Button asChild variant="outline" className="min-h-11 justify-start"><Link href="/vendor-dashboard/payment-history"><History className="h-4 w-4" aria-hidden /> Payment history <ArrowRight className="ml-auto h-4 w-4" aria-hidden /></Link></Button>
        <Button asChild variant="outline" className="min-h-11 justify-start"><Link href="/vendor-dashboard/invoices"><FileText className="h-4 w-4" aria-hidden /> Invoices <ArrowRight className="ml-auto h-4 w-4" aria-hidden /></Link></Button>
      </nav>
    </div>
  </VendorDashboardLayout>;
}

function BillingPanel({ vendorId }: { vendorId: string }) {
  const [snapshot, setSnapshot] = useState<VendorSubscriptionSnapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const paying = useRef(false);
  const load = useCallback(async () => {
    request.current?.abort();
    const task = new AbortController();
    request.current = task;
    setLoadError('');
    setSnapshot(null);
    const timeout = setTimeout(() => task.abort('timeout'), 12_000);
    try {
      const response = await fetch('/api/vendor/subscription?' + new URLSearchParams({ vendor: vendorId }), { signal: task.signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Billing is temporarily unavailable.');
      if (!task.signal.aborted) setSnapshot(data as VendorSubscriptionSnapshot);
    } catch (cause) {
      if (request.current === task && (!task.signal.aborted || task.signal.reason === 'timeout')) {
        setLoadError(task.signal.reason !== 'timeout' && cause instanceof Error ? cause.message : 'Billing is temporarily unavailable.');
      }
    } finally { clearTimeout(timeout); }
  }, [vendorId]);

  useEffect(() => {
    void load();
    const onRestore = (event: PageTransitionEvent) => {
      if (event.persisted) { paying.current = false; setBusy(false); setConfirm(false); void load(); }
    };
    window.addEventListener('pageshow', onRestore);
    return () => { request.current?.abort(); window.removeEventListener('pageshow', onRestore); };
  }, [load]);

  const pay = async () => {
    if (!snapshot?.paystackAvailable || paying.current) return;
    paying.current = true;
    setBusy(true);
    setPaymentError('');
    let leaving = false;
    try {
      const result = await startPaystackCheckout({
        purpose: 'subscription', vendorId, idempotencyKey: createIdempotencyKey(),
        acceptedPrice: snapshot.price, checkoutVersion: snapshot.checkoutVersion,
      });
      if (result.alreadyPaid && result.reference) {
        window.location.assign(checkPayment(result.reference));
        leaving = true;
        return;
      }
      if (result.authorizationUrl && /^https:\/\/checkout\.paystack\.com\/[a-zA-Z0-9._-]{1,200}\/?$/.test(result.authorizationUrl)) {
        window.location.assign(result.authorizationUrl);
        leaving = true;
        return;
      }
      setPaymentError(result.error || 'We could not open Paystack. Check your billing status before trying again.');
    } catch {
      setPaymentError('We could not open Paystack. Check your billing status before trying again.');
    } finally {
      if (!leaving) {
        paying.current = false;
        setBusy(false);
        setConfirm(false);
        void load();
      }
    }
  };
  const notice = paymentError && <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm">{paymentError}</p>;
  if (!snapshot) return <>{notice}{loadError ? <div className="rounded-2xl border bg-card p-5" role="alert">
    <p>{loadError}</p><Button variant="outline" className="mt-3 min-h-11" onClick={() => void load()}>Reload billing</Button>
  </div> : <Skeleton aria-label="Loading billing" className="h-56 w-full rounded-2xl" />}</>;

  const { subscription, openPayment, plan, price, paystackAvailable } = snapshot;
  const status = vendorSubscriptionCoverage(subscription?.status ?? null, subscription?.ends_at ?? null);
  const end = subscription?.ends_at ? Date.parse(subscription.ends_at) : NaN;
  const isActive = status === 'active';
  const coverageDate = Number.isFinite(end) ? ghDate.format(end) : null;
  const priceLabel = 'GH₵' + price;
  const planName = vendorSubscriptionPlans[plan].name;
  const activePlan = subscription?.plan === 'student_vendor' || subscription?.plan === 'external_vendor'
    ? vendorSubscriptionPlans[subscription.plan].name : null;
  const review = openPayment?.status === 'reconciliation_required';

  return <>
    {notice}
    <div className="grid gap-4 md:grid-cols-[1.15fr_1fr]">
      <section aria-labelledby="vendor-plan" className="min-w-0 rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="vendor-plan" className="text-lg font-bold">{planName}</h2>
          <Badge variant="outline" className={isActive ? 'border-success/40 text-success' : ''}>
            {isActive ? 'Active' : status === 'expired' ? 'Expired' : status === 'cancelled' ? 'Cancelled' : 'No active plan'}
          </Badge>
        </div>
        <p className="mt-4 flex flex-wrap items-baseline gap-2"><span className="text-4xl font-bold tracking-tight">{priceLabel}</span><span className="text-sm text-muted-foreground">for 30 days</span></p>
        <p className="mt-2 text-sm text-muted-foreground">One payment at a time. No automatic charges.</p>
        {snapshot.studentBusiness && plan === 'external_vendor' && <p className="mt-4 rounded-xl bg-muted p-3 text-sm">
          The student rate is available to verified student vendors. Your account currently qualifies for the business rate. <Link className="font-medium text-primary underline" href="/vendor-dashboard/verification">Open verification</Link>.
        </p>}
        {!openPayment && <Button onClick={() => { setPaymentError(''); setConfirm(true); }} disabled={!paystackAvailable || busy} className="mt-5 min-h-11 w-full">
          <CreditCard className="h-4 w-4" aria-hidden /> {isActive ? 'Renew for ' + priceLabel : 'Subscribe for ' + priceLabel}
        </Button>}
        {!paystackAvailable && <p className="mt-3 text-sm text-muted-foreground">New checkouts are temporarily unavailable. <a className="underline" href={support}>Contact support</a> if you need help.</p>}
      </section>
      <section aria-labelledby="vendor-coverage" className="min-w-0 space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
        <div>
          <h2 id="vendor-coverage" className="flex items-center gap-2 text-base font-bold"><CalendarDays className="h-4 w-4 text-primary" aria-hidden /> Subscription coverage</h2>
          <p className="mt-2 text-sm text-muted-foreground">{coverageDate
            ? (isActive ? (activePlan ? activePlan + ' active until ' : 'Active until ') : 'Previous coverage end date: ') + coverageDate
            : isActive ? 'Your subscription is active.' : 'Coverage starts when Paystack confirms payment.'}</p>
          {isActive && coverageDate && <p className="mt-1 text-sm text-muted-foreground">Renewing early adds 30 days after this date.</p>}
        </div>
        <div className="border-t pt-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> Secure Paystack checkout</p>
          <p className="mt-1 text-sm text-muted-foreground">Choose an available method on Paystack. Subscription payments are separate from the one-time registration fee.</p>
        </div>
        <button type="button" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline" onClick={() => { setPaymentError(''); void load(); }} disabled={busy}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh billing
        </button>
      </section>
    </div>
    {openPayment && <section aria-labelledby="vendor-open-payment" className="min-w-0 space-y-3 rounded-2xl border border-warning/35 bg-card p-5">
      <h2 id="vendor-open-payment" className="flex items-center gap-2 font-bold"><TriangleAlert className="h-4 w-4 text-warning" aria-hidden /> {review ? 'Payment needs review' : 'Payment in progress'}</h2>
      <p className="text-sm text-muted-foreground">{review ? 'Contact support before paying again.' : 'If you have already been charged or received a Mobile Money prompt, check the result before paying again.'}</p>
      <p className="text-sm font-semibold">Payment amount: GH₵{openPayment.amount.toFixed(2)}</p>
      <p className="break-all text-xs text-muted-foreground">Reference: {openPayment.reference}</p>
      <div className="flex flex-wrap gap-2">
        {review ? <Button asChild className="min-h-11"><a href={support}>Contact support</a></Button> : <>
          <Button asChild className="min-h-11"><Link href={checkPayment(openPayment.reference)}>Check payment status</Link></Button>
          {paystackAvailable && openPayment.canResume && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void pay()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Resume Paystack checkout
          </Button>}
        </>}
      </div>
    </section>}
    <Dialog open={confirm} onOpenChange={value => { if (!busy) setConfirm(value); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm subscription</DialogTitle>
          <DialogDescription>{planName} · {priceLabel} for 30 days. This is a one-time payment.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirm(false)}>Back</Button>
          <Button className="min-h-11" disabled={busy} onClick={() => void pay()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />} Continue to Paystack</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
