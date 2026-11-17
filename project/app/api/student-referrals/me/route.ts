import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseRegistrationAccess } from '@/lib/auth/registration-access';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const { data: state, error: stateError } = await supabase.rpc('get_my_registration_access');
  const access = !stateError ? parseRegistrationAccess(state) : null;
  if (!access) return NextResponse.json({ error: 'Couldn’t check referral access. Try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  if (!access.can_student_referral) return NextResponse.json({ error: access.buyer_restricted ? 'Buyer accounts don’t have referral links.' : 'A verified student seller payment is required for student referrals.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const { data: ensured, error: ensureError } = await supabase.rpc('ensure_my_student_referral_link');
  if (ensureError) return NextResponse.json({ error: 'Referral link is not available for this account.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (ensured?.eligible !== true) return NextResponse.json({ error: 'Referral link is not available for this account.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const { data, error } = await supabase.rpc('get_my_referral_summary');
  if (error) return NextResponse.json({ error: 'Referral summary is not available for this account.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const publicBase = 'https://www.uniecoghana.com';
  const code = typeof ensured?.code === 'string' ? ensured.code : typeof data?.code === 'string' ? data.code : null;
  return NextResponse.json({
    summary: data,
    referralCode: code,
    referralLink: code ? `${publicBase}/signup?ref=${encodeURIComponent(code)}&intent=student` : null,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Referral payouts are not enabled yet.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
