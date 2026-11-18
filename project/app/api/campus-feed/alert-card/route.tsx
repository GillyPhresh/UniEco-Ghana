import { createClient } from '@/lib/supabase/server';
import { campusFeedUuid } from '@/lib/ai/research-catalog';
import { renderUpdateFlyer } from '@/lib/ai/flyer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const unavailable = () => new Response('Approved campus update not found.', { status: 404, headers });
const maxCardBytes = 3 * 1024 * 1024;
const completed = new Map<string, { bytes: ArrayBuffer; until: number }>();
const rendering = new Map<string, Promise<ArrayBuffer>>();

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get('id') || '';
  if (!campusFeedUuid.test(id)) return unavailable();
  const supabase = await createClient();
  const { data, error } = await supabase.from('campus_feed_public_items')
    .select('id,source_id,source_label,university_name,title,excerpt,published_at,category,canonical_url').eq('id', id).maybeSingle();
  if (error) return new Response('Flyer temporarily unavailable.', { status: 503, headers });
  if (!data) return unavailable();
  // Always check visibility before serving a cached raster, including a
  // previously copied flyer link after an editor has unpublished the story.
  const format = params.get('format') === 'jpeg' ? 'jpeg' : 'png';
  const key = JSON.stringify([format, data]);
  try {
    let stored = completed.get(key);
    if (stored && stored.until <= Date.now()) { completed.delete(key); stored = undefined; }
    let task = rendering.get(key);
    if (!stored && !task) {
      if (rendering.size >= 3) return new Response('Flyer generation is busy. Please try again.', { status: 429, headers: { ...headers, 'Retry-After': '3' } });
      task = renderUpdateFlyer(data, { format }).then((image) => image.arrayBuffer()).then((bytes) => {
        if (!bytes.byteLength || bytes.byteLength > maxCardBytes) throw new Error('Invalid flyer size');
        if (completed.size >= 16) completed.delete(completed.keys().next().value!);
        completed.set(key, { bytes, until: Date.now() + 5 * 60_000 });
        return bytes;
      }).finally(() => { rendering.delete(key); });
      rendering.set(key, task);
    }
    const bytes = stored?.bytes || await task;
    if (!bytes) throw new Error('Missing flyer');
    const extension = format === 'jpeg' ? 'jpg' : 'png';
    return new Response(bytes, {
      headers: { ...headers, 'Content-Type': 'image/' + format,
        'Content-Disposition': (params.get('download') === '1' ? 'attachment' : 'inline') + '; filename="unieco-campus-update.' + extension + '"' },
    });
  } catch {
    return new Response('Flyer temporarily unavailable.', { status: 503, headers });
  }
}
