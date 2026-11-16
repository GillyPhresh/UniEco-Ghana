import { loadBulletin, parseBulletinFilter } from '@/lib/ai/bulletin';
import { renderBulletinFlyer } from '@/lib/ai/flyer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filter = parseBulletinFilter(params);
  if (!filter) return new Response('Invalid campus briefing filter.', { status: 400, headers });
  try {
    const data = await loadBulletin(filter);
    if (!data || !data.total) return new Response('No approved updates for this edition.', { status: 404, headers });
    return renderBulletinFlyer(data, params.get('download') === '1');
  } catch { return new Response('Campus briefing unavailable.', { status: 503, headers }); }
}
