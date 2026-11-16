import { createClient } from '@/lib/supabase/server';
import { campusFeedUuid } from '@/lib/ai/research-catalog';
import { renderUpdateFlyer } from '@/lib/ai/flyer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const unavailable = () => new Response('Approved campus update not found.', { status: 404, headers });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get('id') || '';
  if (!campusFeedUuid.test(id)) return unavailable();
  const supabase = await createClient();
  const { data, error } = await supabase.from('campus_feed_public_items')
    .select('id,source_label,university_name,title,excerpt,published_at,category').eq('id', id).maybeSingle();
  if (error) return new Response('Flyer temporarily unavailable.', { status: 503, headers });
  if (!data) return unavailable();
  return renderUpdateFlyer(data, { download: params.get('download') === '1' });
}
