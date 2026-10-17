import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
  if (!user) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { data } = await supabase.from('payments').select('payment_reference,status,payment_type,amount,currency,failure_reason,updated_at').eq('payment_reference', reference).eq('user_id', user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  return NextResponse.json({ payment: data }, { headers: { 'Cache-Control': 'no-store' } });
}
