import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get('reference');
  if (!reference || !/^[A-Za-z0-9._=-]{8,120}$/.test(reference)) return NextResponse.json({ error: 'Invalid payment reference.' }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { data } = await supabase.from('payments').select('payment_reference,status,payment_type,amount,currency,failure_reason,updated_at').eq('payment_reference', reference).eq('user_id', user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  return NextResponse.json({ payment: data }, { headers: { 'Cache-Control': 'no-store' } });
}
