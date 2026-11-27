import { createClient } from '@/lib/supabase/server';
import { campusFeedUuid } from '@/lib/ai/research-catalog';
import { renderUpdateFlyer, renderUpdatePhoto } from '@/lib/ai/flyer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const unavailable = () => new Response('Approved campus update not found.', { status: 404, headers });
const maxCardBytes = 3 * 1024 * 1024;
const completed = new Map<string, { bytes: ArrayBuffer; until: number; photoKind: string }>();
const rendering = new Map<string, Promise<ArrayBuffer>>();

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const publisherKey=params.get('publisher');
  if(publisherKey!==null){
    if(publisherKey.length>2048 || !publisherKey.startsWith('https://'))return unavailable();
    const {publisherCard}=await import('@/lib/ai/publisher-card.server');
    const item=await publisherCard(publisherKey);
    return item ? cardResponse(item,params) : unavailable();
  }
  const id = params.get('id') || '';
  if (!campusFeedUuid.test(id)) return unavailable();
  const supabase = await createClient();
  const { data, error } = await supabase.from('campus_feed_public_items')
    .select('id,source_id,source_label,university_name,title,excerpt,published_at,category,canonical_url,media_url,media_type').eq('id', id).maybeSingle();
  if (error) return new Response('Flyer temporarily unavailable.', { status: 503, headers });
  if (!data) return unavailable();
  const { data: source, error: sourceError } = await supabase.from('campus_feed_public_sources')
    .select('source_kind').eq('source_id', data.source_id).maybeSingle();
  if (sourceError || !source) return new Response('Flyer temporarily unavailable.', { status: 503, headers });
  const flyerItem = { ...data, source_kind: source.source_kind };
  if(source.source_kind!=='campus' && (!data.media_url || data.media_type!=='image')){
    const {withWirePhoto}=await import('@/lib/ai/story-photo-wire.server');
    return cardResponse(await withWirePhoto(flyerItem),params);
  }
  return cardResponse(flyerItem,params);
}

async function cardResponse(flyerItem:import('@/lib/ai/flyer').FlyerItem,params:URLSearchParams) {
  if(flyerItem.media_type==='image' && flyerItem.media_url){
    const {photoCredit}=await import('@/lib/ai/photo-permissions.server');
    flyerItem={...flyerItem,clearedCredit:await photoCredit(flyerItem)};
  }
  // Always check visibility before serving a cached raster, including a
  // previously copied flyer link after an editor has unpublished the story.
  const format = params.get('format') === 'photo' ? 'photo' : params.get('format') === 'jpeg' ? 'jpeg' : 'png';
  const key = JSON.stringify([format, flyerItem]);
  try {
    let stored = completed.get(key);
    if (stored && stored.until <= Date.now()) { completed.delete(key); stored = undefined; }
    let task = rendering.get(key);
    if (!stored && !task) {
      if (rendering.size >= 3) return new Response('Flyer generation is busy. Please try again.', { status: 429, headers: { ...headers, 'Retry-After': '3' } });
      task = (format === 'photo' ? renderUpdatePhoto(flyerItem) : renderUpdateFlyer(flyerItem, { format }))
        .then(async image => ({ bytes: await image.arrayBuffer(), photoKind: image.headers.get('X-UniEco-Photo-Type') || 'fallback' }))
        .then(({ bytes, photoKind }) => {
        if (!bytes.byteLength || bytes.byteLength > maxCardBytes) throw new Error('Invalid flyer size');
        if (completed.size >= 16) completed.delete(completed.keys().next().value!);
        completed.set(key, { bytes, photoKind, until: Date.now() + (photoKind === 'story' ? 5 * 60_000 : 15_000) });
        return bytes;
      }).finally(() => { rendering.delete(key); });
      rendering.set(key, task);
    }
    const bytes = stored?.bytes || await task;
    if (!bytes) throw new Error('Missing flyer');
    if(params.has('publisher') && format==='photo' && completed.get(key)?.photoKind!=='story'){
      return new Response(null,{status:204,headers});
    }
    const extension = format === 'png' ? 'png' : 'jpg';
    return new Response(bytes, {
      headers: { ...headers, 'Content-Type': format === 'png' ? 'image/png' : 'image/jpeg',
        'X-UniEco-Photo-Type': completed.get(key)?.photoKind || 'fallback',
        'Content-Disposition': (params.get('download') === '1' ? 'attachment' : 'inline') + '; filename="unieco-campus-update.' + extension + '"' },
    });
  } catch {
    return new Response('Flyer temporarily unavailable.', { status: 503, headers });
  }
}
