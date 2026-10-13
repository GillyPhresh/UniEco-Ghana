import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const { data, error } = await supabase.rpc('get_admin_student_referral_overview');
  if (error) return NextResponse.json({ error: 'You are not authorized to view referral financial operations.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ overview: data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
