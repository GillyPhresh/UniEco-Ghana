'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { safeInternalPath, withNext } from '@/lib/auth/redirects';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Payment = { status: string; amount: number; currency: string; payment_type: string; failure_reason: string | null };

export default function PaymentCallbackPage() {
  return <Suspense fallback={<main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4">Checking your payment…</main>}><PaymentCallbackContent /></Suspense>;
}

function PaymentCallbackContent() {
  const params = useSearchParams();
  const reference = params.get('reference') || params.get('trxref');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [checking, setChecking] = useState(true);
  const [registrationNext, setRegistrationNext] = useState('/');
  useEffect(() => {
    setRegistrationNext(safeInternalPath(window.sessionStorage.getItem('unieco_registration_next')));
  }, []);
  useEffect(() => {
    if (!reference) { setError('No payment reference was provided.'); return; }
    setError(null);
    setChecking(true);
    let cancelled = false;
    let attempts = 0;
    let reconciled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`/api/payments/status?reference=${encodeURIComponent(reference)}`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        });
        const body = await response.json() as { payment?: Payment; error?: string };
        if (!response.ok) throw new Error(body.error || 'Payment could not be found.');
        if (cancelled) return;
        let currentPayment = body.payment || null;
        if (currentPayment && !['success', 'failed', 'cancelled', 'refunded'].includes(currentPayment.status) && !reconciled) {
          reconciled = true;
          try {
            const reconcileResponse = await fetch('/api/payments/reconcile', {
              method: 'POST',
              cache: 'no-store',
              signal: AbortSignal.timeout(10_000),
              headers: {
                'Content-Type': 'application/json',
                ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
              },
              body: JSON.stringify({ reference }),
            });
            const reconciledBody = await reconcileResponse.json() as { payment?: Payment };
            if (reconcileResponse.ok && reconciledBody.payment) currentPayment = reconciledBody.payment;
          } catch {
            // Keep polling the webhook-backed status if provider verification is temporarily unavailable.
          }
        }
        if (cancelled) return;
        setPayment(currentPayment);
        attempts += 1;
        if (!['success','failed','cancelled','abandoned','reconciliation_required','refunded','partially_refunded'].includes(currentPayment?.status || '') && attempts < 20) timer = setTimeout(check, 3000);
        else setChecking(false);
      } catch (reason) {
        if (!cancelled) {
          setChecking(false);
          setError(reason instanceof Error && reason.name === 'Error' ? reason.message : 'Couldn’t check the payment. Please check again.');
        }
      }
    };
    void check();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [reference, retry]);
  const successful = payment?.status === 'success';
  const canRetryPayment = ['failed', 'cancelled', 'abandoned'].includes(payment?.status || '');
  const needsSupport = ['reconciliation_required', 'refunded', 'partially_refunded'].includes(payment?.status || '');
  const failed = canRetryPayment || needsSupport;
  const successHref = payment?.payment_type === 'student_registration' || payment?.payment_type === 'vendor_registration'
    ? withNext('/onboarding/complete?registration=paid', registrationNext)
    : '/dashboard/payment-history';
  const registrationHref = payment?.payment_type === 'student_registration'
    ? withNext('/onboarding/student?payment_required=1', registrationNext)
    : payment?.payment_type === 'vendor_registration'
      ? withNext('/onboarding/vendor?payment_required=1', registrationNext)
      : '/dashboard/payment-history';
  const actionHref = needsSupport ? 'mailto:support@uniecoghana.com' : successful ? successHref : canRetryPayment ? registrationHref : '/dashboard/payment-history';
  const actionLabel = successful && (payment?.payment_type === 'student_registration' || payment?.payment_type === 'vendor_registration')
    ? 'Continue to UniEco'
    : needsSupport ? 'Contact support' : canRetryPayment && (payment?.payment_type === 'student_registration' || payment?.payment_type === 'vendor_registration')
      ? 'Try payment again'
      : 'View payment history';
  return <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4"><section className="w-full rounded-2xl border bg-card p-7 text-center shadow-sm">
    {!payment && !error && <><Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" /><h1 className="mt-4 text-xl font-bold">Checking your payment</h1><p className="mt-2 text-sm text-muted-foreground">We are waiting for Paystack’s verified result.</p></>}
    {payment && <>{successful ? <CheckCircle2 className="mx-auto h-11 w-11 text-success" /> : failed ? <XCircle className="mx-auto h-11 w-11 text-destructive" /> : <Clock3 className="mx-auto h-11 w-11 text-warning" />}<h1 className="mt-4 text-xl font-bold">{successful ? 'Payment confirmed' : failed ? 'Payment needs attention' : 'Payment is pending'}</h1><p className="mt-2 text-sm text-muted-foreground">{successful ? 'Paystack confirmed your payment.' : needsSupport ? 'Contact support about this payment before trying again.' : canRetryPayment ? 'This attempt did not complete.' : 'If you chose Mobile Money, approve the prompt on your phone. Don’t pay again while this payment is pending.'}</p><p className="mt-4 font-medium">{payment.currency} {Number(payment.amount).toFixed(2)}</p></>}
    {error && <><XCircle className="mx-auto h-11 w-11 text-destructive" /><h1 className="mt-4 text-xl font-bold">Payment status unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p></>}
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      {reference && !checking && !successful && !failed && <Button type="button" onClick={() => setRetry((value) => value + 1)}>Check payment again</Button>}
      <Button asChild variant={!successful && !failed ? 'outline' : 'default'}><Link href={actionHref}>{actionLabel}</Link></Button>
    </div>
  </section></main>;
}
