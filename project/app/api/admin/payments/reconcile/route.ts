import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PaystackReconciliationApplyError, reconcilePaystackPayment } from '@/lib/payments/paystack-reconciliation.server';
import { PaystackVerificationError } from '@/lib/payments/paystack.server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const diagnosticId = crypto.randomUUID();
  try {
    const body = await request.json() as { reference?: string };
    const reference = String(body.reference || '');
    if (!/^[A-Za-z0-9._=-]{8,120}$/.test(reference)) return NextResponse.json({ error: 'Invalid payment reference.' }, { status: 400, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });

    const { data: isSuperAdmin, error: roleError } = await supabase.rpc('is_super_admin');
    if (roleError || isSuperAdmin !== true) return NextResponse.json({ error: 'Super administrator access required.' }, { status: 403 });

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('payment_reference,status,provider')
      .eq('payment_reference', reference)
      .maybeSingle();
    if (paymentError || !payment) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
    if (payment.provider !== 'paystack') return NextResponse.json({ error: 'This payment cannot be reconciled automatically.' }, { status: 422 });

    const verification = await reconcilePaystackPayment(reference);
    const { data: refreshed } = await supabase
      .from('payments')
      .select('payment_reference,status,payment_type,amount,currency,failure_reason,updated_at')
      .eq('payment_reference', reference)
      .maybeSingle();
    return NextResponse.json({ payment: refreshed, verification }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof PaystackVerificationError
      ? error.code
      : error instanceof PaystackReconciliationApplyError
        ? 'verified_but_not_applied'
        : 'internal';
    console.error('[admin/payments/reconcile] failed', { diagnosticId, code });
    const message = code === 'configuration'
      ? 'Paystack verification is not configured for this payment environment. No payment status was changed; check the production Paystack secret configuration.'
      : code === 'timeout' || code === 'network'
        ? 'Paystack could not be reached just now. No payment status was changed; retry verification shortly.'
        : code === 'provider_response' || code === 'invalid_response'
          ? 'Paystack did not return a verifiable transaction result. No payment status was changed; confirm the reference in Paystack and retry.'
          : code === 'verified_but_not_applied'
            ? `Paystack verification completed, but UniEco could not safely apply the result. No payment status was changed. Share diagnostic ID ${diagnosticId} with support.`
          : 'Payment verification could not be completed. No payment status was changed; retry shortly.';
    return NextResponse.json({ error: message, diagnosticId }, { status: code === 'configuration' ? 503 : 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
