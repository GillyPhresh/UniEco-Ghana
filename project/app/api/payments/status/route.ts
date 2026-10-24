import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { reconcilePaystackPayment } from '@/lib/payments/paystack-reconciliation.server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get('reference');
  if (!reference || !/^[A-Za-z0-9._=-]{8,120}$/.test(reference)) return NextResponse.json({ error: 'Invalid payment reference.' }, { status: 400 });
  const supabase = await createClient();
  let { data: { user } } = await supabase.auth.getUser();
  // Paystack returns to the browser from a different origin. In some browser
  // privacy modes the SSR session cookie is not available on that first
  // request, even though the browser still has the active Supabase session.
  // Accept the short-lived access token from the same-origin callback page as
  // a fallback; the payment query remains scoped to that authenticated user.
  if (!user) {
    const authorization = request.headers.get('authorization');
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (accessToken) {
      const tokenResult = await supabase.auth.getUser(accessToken);
      user = tokenResult.data.user;
    }
  }
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = serviceUrl && serviceKey
    ? createAdminClient(serviceUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  // Paystack can return the browser without the Supabase session cookie. The
  // payment reference is the callback capability in that case. We still read
  // through the service client, and a pending Paystack payment is reconciled
  // only through the server-side verification path before its status is shown.
  if (!user && !admin) return NextResponse.json({ error: 'Payment status is temporarily unavailable.' }, { status: 503 });
  const query = (user ? supabase : admin!)
    .from('payments')
    .select('payment_reference,status,payment_type,amount,currency,failure_reason,updated_at,provider,user_id')
    .eq('payment_reference', reference);
  const { data: found, error: lookupError } = await (user ? query.eq('user_id', user.id) : query).maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'Payment status is temporarily unavailable.' }, { status: 503 });
  if (!found) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });

  if (!user && found.provider === 'paystack' && ['initiated', 'pending'].includes(found.status)) {
    try {
      await reconcilePaystackPayment(reference);
    } catch (error) {
      // A delayed provider response or webhook should leave the callback in a
      // truthful pending state rather than turning a valid return into an error.
      console.warn('[payments/status] Paystack callback reconciliation pending', error instanceof Error ? error.message : 'unknown error');
    }
  }

  const refreshedQuery = (user ? supabase : admin!)
    .from('payments')
    .select('payment_reference,status,payment_type,amount,currency,failure_reason,updated_at')
    .eq('payment_reference', reference);
  const { data } = await (user ? refreshedQuery.eq('user_id', user.id) : refreshedQuery).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  return NextResponse.json({ payment: data }, { headers: { 'Cache-Control': 'no-store' } });
}
