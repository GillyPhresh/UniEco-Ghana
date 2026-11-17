import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseRegistrationAccess } from '@/lib/auth/registration-access';

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

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  const { data: state, error: stateError } = await supabase.rpc('get_my_registration_access');
  const access = !stateError ? parseRegistrationAccess(state) : null;
  if (!access) return NextResponse.json({ error: 'Couldn’t check referral access. Try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  if (!access.can_vendor_referral && !access.can_student_referral) {
    return NextResponse.json({ error: access.buyer_restricted ? 'Buyer accounts don’t have referral links.' : 'This account is not eligible for referral links.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const isVendor = access.can_vendor_referral;
  const ensureFunction = isVendor ? 'ensure_my_vendor_referral_link' : 'ensure_my_student_referral_link';
  const summaryFunction = isVendor ? 'get_my_vendor_referral_summary' : 'get_my_referral_summary';

  const { data: ensured, error: ensureError } = await supabase.rpc(ensureFunction);
  if (ensureError) {
    return NextResponse.json({ error: 'Referral link is not available for this account.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  if (ensured?.eligible !== true) {
    return NextResponse.json({ error: 'This account is not eligible for referral rewards.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const { data: summary, error: summaryError } = await supabase.rpc(summaryFunction);
  if (summaryError) {
    return NextResponse.json({ error: 'Referral summary is not available for this account.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  // Keep shared links on the canonical public host. Do not let a deployment
  // variable redirect referral traffic to an unrelated origin.
  const publicBase = 'https://www.uniecoghana.com';
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
