import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { parseRecommendationQuery, recommendationWindow, selectRecommendations } from '@/lib/intelligence/model';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const privateHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
let activeRequests = 0;

export async function GET(request: Request) {
  const query = parseRecommendationQuery(new URL(request.url).searchParams);
  if (!query) return NextResponse.json({ error: 'Choose a valid topic and campus source.' }, { status: 400, headers: privateHeaders });
  if (activeRequests >= 12) return NextResponse.json({ error: 'Suggestions are busy. Try again shortly.' },
    { status: 429, headers: { ...privateHeaders, 'Retry-After': '5' } });
  activeRequests++;
  try {
    const { url, anonKey } = getSupabaseConfig();
    // This reader sees only the public projection, even when cookies are
    // present on the request. No analytics stream or identity is consulted.
    const db = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const now = Date.now();
    let items = db.from('campus_feed_public_items').select('id,source_id,source_label,title,published_at,category')
      .eq('category', query.topic).gte('published_at', new Date(now - recommendationWindow * 86_400_000).toISOString())
      .lte('published_at', new Date(now).toISOString());
    if (query.source) items = items.eq('source_id', query.source);
    const { data, error } = await items.order('published_at', { ascending: false }).order('id')
      .limit(query.source ? 6 : 36).abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error('Recommendations unavailable.');
    return NextResponse.json({
      topic: query.topic, source: query.source, days: recommendationWindow,
      items: selectRecommendations(data, now, query.topic, query.source),
    }, { headers: { ...privateHeaders, 'Cache-Control': query.source ? 'public, max-age=30' : 'public, max-age=60, s-maxage=60' } });
  } catch {
    return NextResponse.json({ error: 'Recommendations are temporarily unavailable.' }, { status: 503, headers: privateHeaders });
  } finally { activeRequests--; }
}
