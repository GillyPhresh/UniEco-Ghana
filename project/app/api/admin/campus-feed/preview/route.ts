import sharp from 'sharp';
import { privateJson, privateResponseHeaders, requireResearchAdmin } from '@/lib/ai/admin-access';
import { campusFeedUuid } from '@/lib/ai/research-catalog';
import { acquireResearchSlot, createResearchClient, loadResearchCatalog } from '@/lib/ai/research-service';
import { fetchPublisher } from '@/lib/ai/publisher-fetch';
import { allowsPublisherPath, loadPublisherPolicy } from '@/lib/ai/publisher-policy';
import { renderUpdateFlyer } from '@/lib/ai/flyer';
import { sourceLink } from '@/lib/ai/public-source-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const safeImages = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export async function GET(request: Request) {
  const auth = await requireResearchAdmin();
  if (!auth.ok) return auth.error;
  const params = new URL(request.url).searchParams;
  const id = params.get('id') || '';
  const format = params.get('format') || 'flyer';
  if (!campusFeedUuid.test(id) || (format !== 'flyer' && format !== 'photo')) return privateJson({ error: 'Invalid preview.' }, 400);
  const db = createResearchClient();
  if (!db) return privateJson({ error: 'Campus previews are unavailable.' }, 503);
  const { data, error } = await db.from('campus_feed_items')
    .select('id,title,excerpt,source_id,source_label,university_name,published_at,category,media_url,media_type,canonical_url')
    .eq('id', id).maybeSingle();
  if (error || !data) return privateJson({ error: 'Preview not available.' }, 404);
  const { data: source, error: sourceError } = await db.from('campus_feed_sources')
    .select('source_kind').eq('id', data.source_id).maybeSingle();
  if (sourceError || !source) return privateJson({ error: 'Preview source is unavailable.' }, 503);
  const flyerItem = { ...data, source_kind: source.source_kind };
  if (format === 'flyer') {
    const {photoCredit}=await import('@/lib/ai/photo-permissions.server');
    const {withWirePhoto}=await import('@/lib/ai/story-photo-wire.server');
    const current=await withWirePhoto(flyerItem);
    return renderUpdateFlyer({...current,clearedCredit:await photoCredit(current)}, { draft: true });
  }
  if (!data.media_url || data.media_type !== 'image') return privateJson({ error: 'No photo to preview.' }, 404);
  const release = acquireResearchSlot('preview:' + auth.userId);
  if (!release) return privateJson({ error: 'Image preview is busy. Try again shortly.' }, 429);
  try {
    const catalog = await loadResearchCatalog(db);
    const source = catalog.find((entry) => entry.state === 'ready' && entry.registration?.id === data.source_id);
    const url = source?.website && sourceLink(data.media_url, source.website, source.hosts);
    if (!source || !url) return privateJson({ error: 'This photo is not on the current verified publisher.' }, 404);
    const policy = await loadPublisherPolicy(url.href, source.hosts, request.signal);
    const page = await fetchPublisher(url.href, source.hosts, {
      maxBytes: 3 * 1024 * 1024, mimeTypes: safeImages, signal: request.signal,
      allowsPath: (target) => allowsPublisherPath(policy, target),
    });
    const decoder = sharp(page.bytes, { limitInputPixels: 16_000_000, pages: 1, failOn: 'warning' });
    const metadata = await decoder.metadata();
    if (!metadata.format || !['jpeg', 'png', 'webp', 'heif'].includes(metadata.format)) return privateJson({ error: 'Unsupported source image.' }, 415);
    const image = await decoder.timeout({ seconds: 3 }).rotate().resize(900, 600, { fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
    return new Response(new Uint8Array(image), { headers: { ...privateResponseHeaders, 'Content-Type': 'image/webp' } });
  } catch { return privateJson({ error: 'Source photo cannot be previewed. Open the original publisher instead.' }, 502); }
  finally { release(); }
}
