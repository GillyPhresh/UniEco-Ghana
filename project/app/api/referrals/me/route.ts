import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type ReferralSummary = {
  code: string | null;
  successful_referrals: number;
  pending_amount: number;
  available_amount: number;
  paid_amount: number;
  total_earned: number;
  minimum_payout: number;
  history: Array<{
    created_at: string;
    referred_name: string;
    registration_status: string;
    reward_amount: number | null;
    reward_status: string | null;
  }>;
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  const { data: roleName } = await supabase.rpc('current_app_role');
  const isVendor = roleName === 'student_vendor' || roleName === 'external_vendor';
  const ensureFunction = isVendor ? 'ensure_my_vendor_referral_link' : 'ensure_my_student_referral_link';
  const summaryFunction = isVendor ? 'get_my_vendor_referral_summary' : 'get_my_referral_summary';

  const { data: ensured, error: ensureError } = await supabase.rpc(ensureFunction);
  if (ensureError) {
    return NextResponse.json({ error: 'Referral link is not available for this account.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const { data: summary, error: summaryError } = await supabase.rpc(summaryFunction);
  if (summaryError) {
    return NextResponse.json({ error: 'Referral summary is not available for this account.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const configured = process.env.UNIECO_PUBLIC_APP_URL?.replace(/\/$/, '');
  const publicBase = configured || 'https://www.uniecoghana.com';
  const referralCode = typeof ensured?.code === 'string'
    ? ensured.code
    : typeof (summary as ReferralSummary | null)?.code === 'string'
      ? (summary as ReferralSummary).code
      : null;
  const audience = isVendor ? 'vendor' : 'student';
  const referralLink = referralCode
    ? `${publicBase}/signup?ref=${encodeURIComponent(referralCode)}&intent=${isVendor ? 'external_vendor' : 'student'}`
    : null;

  return NextResponse.json({
    audience,
    summary,
    referralCode,
    referralLink,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
