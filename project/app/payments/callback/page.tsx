'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Payment = { status: string; amount: number; currency: string; payment_type: string; failure_reason: string | null };

export default function PaymentCallbackPage() {
  return <Suspense fallback={<main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4">Checking your payment…</main>}><PaymentCallbackContent /></Suspense>;
}

function PaymentCallbackContent() {
  const params = useSearchParams();
  const reference = params.get('reference');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!reference) { setError('No payment reference was provided.'); return; }
    let cancelled = false;
    let attempts = 0;
    let reconciled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`/api/payments/status?reference=${encodeURIComponent(reference)}`, {
          cache: 'no-store',
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        });
        const body = await response.json() as { payment?: Payment; error?: string };
        if (!response.ok) throw new Error(body.error || 'Payment could not be found.');
        if (cancelled) return;
        let currentPayment = body.payment || null;
        if (currentPayment && !['success', 'failed', 'cancelled', 'reconciliation_required', 'refunded'].includes(currentPayment.status) && !reconciled) {
          reconciled = true;
          try {
            const reconcileResponse = await fetch('/api/payments/reconcile', {
              method: 'POST',
              cache: 'no-store',
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
        setPayment(currentPayment);
        attempts += 1;
        if (!['success','failed','cancelled','reconciliation_required','refunded'].includes(currentPayment?.status || '') && attempts < 20) timer = setTimeout(check, 3000);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Payment could not be found.');
      }
    };
    void check();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [reference]);
  const successful = payment?.status === 'success';
  const failed = ['failed','cancelled','abandoned','reconciliation_required','refunded'].includes(payment?.status || '');
  return <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4"><section className="w-full rounded-2xl border bg-card p-7 text-center shadow-sm">
    {!payment && !error && <><Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" /><h1 className="mt-4 text-xl font-bold">Checking your payment</h1><p className="mt-2 text-sm text-muted-foreground">We are waiting for Paystack’s verified result.</p></>}
    {payment && <>{successful ? <CheckCircle2 className="mx-auto h-11 w-11 text-success" /> : failed ? <XCircle className="mx-auto h-11 w-11 text-destructive" /> : <Clock3 className="mx-auto h-11 w-11 text-warning" />}<h1 className="mt-4 text-xl font-bold">{successful ? 'Payment confirmed' : failed ? 'Payment needs attention' : 'Payment is pending'}</h1><p className="mt-2 text-sm text-muted-foreground">{successful ? 'Your payment was confirmed by Paystack and applied to UniEco Ghana.' : failed ? (payment.failure_reason || 'No value has been granted. You may try again from your dashboard.') : 'If you used Mobile Money, approve the prompt on your phone. This page will not mark a payment successful; Paystack’s verified webhook does that.'}</p><p className="mt-4 font-medium">{payment.currency} {Number(payment.amount).toFixed(2)}</p></>}
    {error && <><XCircle className="mx-auto h-11 w-11 text-destructive" /><h1 className="mt-4 text-xl font-bold">Payment status unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p></>}
    <Button asChild className="mt-6"><Link href={successful && payment?.payment_type === 'student_registration' ? '/dashboard/referrals' : '/dashboard/payment-history'}>{successful && payment?.payment_type === 'student_registration' ? 'Continue to UniEco' : 'View payment history'}</Link></Button>
  </section></main>;
}
