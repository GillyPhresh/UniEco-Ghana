import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const { data, error } = await supabase.rpc('get_my_referral_summary');
  if (error) return NextResponse.json({ error: 'Referral summary is not available for this account.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const configured = process.env.UNIECO_PUBLIC_APP_URL?.replace(/\/$/, '');
  const publicBase = configured || request.nextUrl.origin;
  const code = typeof data?.code === 'string' ? data.code : null;
  return NextResponse.json({ summary: data, referralLink: code ? `${publicBase}/register?ref=${encodeURIComponent(code)}` : null }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  let body: { accountHolderName?: string; mobileNumber?: string; provider?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (typeof body.accountHolderName !== 'string' || typeof body.mobileNumber !== 'string' || typeof body.provider !== 'string') return NextResponse.json({ error: 'Enter the payout destination details.' }, { status: 400 });
  const { data, error } = await supabase.rpc('upsert_my_referral_payout_destination', { p_name: body.accountHolderName, p_mobile: body.mobileNumber, p_provider: body.provider });
  if (error) return NextResponse.json({ error: 'Payout destination could not be saved. Check the details and try again.' }, { status: 422, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ destination: data, message: 'Destination saved. It must be independently verified before payouts can be requested.' }, { headers: { 'Cache-Control': 'private, no-store' } });
}
