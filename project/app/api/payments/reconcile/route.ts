import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { reconcilePaystackPayment } from '@/lib/payments/paystack-reconciliation.server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { reference?: string };
    const reference = String(body.reference || '');
    const supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (accessToken) user = (await supabase.auth.getUser(accessToken)).data.user;
    }
    if (!user) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('payment_reference,status,provider')
      .eq('payment_reference', reference)
      .eq('user_id', user.id)
      .maybeSingle();
    if (paymentError || !payment) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
    if (payment.provider !== 'paystack') return NextResponse.json({ error: 'This payment cannot be reconciled automatically.' }, { status: 422 });
    if (['success', 'failed', 'cancelled', 'refunded', 'cash_on_delivery'].includes(payment.status)) {
      return NextResponse.json({ payment }, { headers: { 'Cache-Control': 'no-store' } });
    }

    await reconcilePaystackPayment(reference);
    const { data: refreshed } = await supabase
      .from('payments')
      .select('payment_reference,status,payment_type,amount,currency,failure_reason,updated_at')
      .eq('payment_reference', reference)
      .eq('user_id', user.id)
      .maybeSingle();
    return NextResponse.json({ payment: refreshed }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[payments/reconcile] failed', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Payment verification is temporarily unavailable.' }, { status: 502 });
  }
}
