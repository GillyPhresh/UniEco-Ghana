'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Payment = { status: string; amount: number; currency: string; payment_type: string; failure_reason: string | null };

export default function PaymentCallbackPage() {
  const params = useSearchParams();
  const reference = params.get('reference');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!reference) { setError('No payment reference was provided.'); return; }
    fetch(`/api/payments/status?reference=${encodeURIComponent(reference)}`).then(async response => {
      const body = await response.json() as { payment?: Payment; error?: string };
      if (!response.ok) throw new Error(body.error || 'Payment could not be found.');
      setPayment(body.payment || null);
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Payment could not be found.'));
  }, [reference]);
  const successful = payment?.status === 'success';
  const failed = ['failed','cancelled','abandoned','reconciliation_required'].includes(payment?.status || '');
  return <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4"><section className="w-full rounded-2xl border bg-card p-7 text-center shadow-sm">
    {!payment && !error && <><Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" /><h1 className="mt-4 text-xl font-bold">Checking your payment</h1><p className="mt-2 text-sm text-muted-foreground">We are waiting for Paystack’s verified result.</p></>}
    {payment && <>{successful ? <CheckCircle2 className="mx-auto h-11 w-11 text-success" /> : failed ? <XCircle className="mx-auto h-11 w-11 text-destructive" /> : <Clock3 className="mx-auto h-11 w-11 text-warning" />}<h1 className="mt-4 text-xl font-bold">{successful ? 'Payment confirmed' : failed ? 'Payment needs attention' : 'Payment is pending'}</h1><p className="mt-2 text-sm text-muted-foreground">{successful ? 'Your payment was confirmed by Paystack and applied to UniEco Ghana.' : failed ? (payment.failure_reason || 'No value has been granted. You may try again from your dashboard.') : 'If you used Mobile Money, approve the prompt on your phone. This page will not mark a payment successful; Paystack’s verified webhook does that.'}</p><p className="mt-4 font-medium">{payment.currency} {Number(payment.amount).toFixed(2)}</p></>}
    {error && <><XCircle className="mx-auto h-11 w-11 text-destructive" /><h1 className="mt-4 text-xl font-bold">Payment status unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p></>}
    <Button asChild className="mt-6"><Link href="/dashboard/payment-history">View payment history</Link></Button>
  </section></main>;
}
