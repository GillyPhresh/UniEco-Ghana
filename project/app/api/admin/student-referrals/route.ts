import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const params = request.nextUrl.searchParams;
  const search = (params.get('q') || '').trim().slice(0, 100) || null;
  const page = Number.parseInt(params.get('page') || '0', 10);
  if (!Number.isInteger(page) || page < 0 || page > 20000) {
    return NextResponse.json({ error: 'Invalid page number.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const { data, error } = await supabase.rpc('get_admin_referral_overview', {
    p_search: search,
    p_limit: 50,
    p_offset: page * 50,
  });
  if (error) {
    const forbidden = error.code === '42501';
    return NextResponse.json(
      { error: forbidden ? 'You are not authorized to view referral financial operations.' : 'Referral records are temporarily unavailable. Please try again.' },
      { status: forbidden ? 403 : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.json({ overview: data }, { headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } });
}
