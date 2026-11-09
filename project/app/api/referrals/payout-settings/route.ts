import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === request.headers.get('host'); } catch { return false; }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return reply({ error: 'Sign in to manage your payout destination.' }, 401);
  const { data: role, error: roleError } = await supabase.rpc('current_app_role');
  if (roleError || !['student', 'student_vendor', 'external_vendor', 'university_admin'].includes(String(role))) return reply({ error: 'This account is not eligible for weekly payouts.' }, 403);
  const { data, error } = await supabase.rpc('get_my_referral_payout_overview');
  if (error) return reply({ error: 'Payout details are not available yet.' }, 503);
  return reply(data || {});
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: 'Request could not be verified. Refresh and try again.' }, 403);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return reply({ error: 'Sign in to save a payout destination.' }, 401);
  const { data: role, error: roleError } = await supabase.rpc('current_app_role');
  if (roleError || !['student', 'student_vendor', 'external_vendor', 'university_admin'].includes(String(role))) return reply({ error: 'This account is not eligible for weekly payouts.' }, 403);
  let input: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 5000) return reply({ error: 'Please check the details and try again.' }, 413);
    input = JSON.parse(raw);
  } catch { return reply({ error: 'Please enter valid payout details.' }, 400); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reply({ error: 'Please enter valid payout details.' }, 400);
  const body = input as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const mobile = typeof body.mobile === 'string' ? body.mobile.trim() : '';
  const provider = body.provider;
  if (name.length < 2 || name.length > 120 || mobile.length > 24 || !['mtn', 'telecel', 'airteltigo'].includes(String(provider))) {
    return reply({ error: 'Enter the registered account name, Ghana mobile number, and network.' }, 400);
  }
  const { data, error } = await supabase.rpc('save_my_referral_payout_destination', { p_name: name, p_mobile: mobile, p_provider: provider });
  if (error) return reply({ error: 'Those payout details could not be saved. Check the Ghana number and try again.' }, 400);
  return reply(data || { saved: true });
}
