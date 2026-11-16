import { acceptsAdminMutation, privateJson, requireResearchAdmin } from '@/lib/ai/admin-access';
import { campusFeedUuid, validSourceId } from '@/lib/ai/research-catalog';
import { createResearchClient } from '@/lib/ai/research-service';
import { readJsonLimited } from '@/lib/http/read-json-limited';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const pageSize = 15;
const statuses = ['pending', 'approved', 'rejected'];

export async function GET(request: Request) {
  const auth = await requireResearchAdmin();
  if (!auth.ok) return auth.error;
  const params = new URL(request.url).searchParams;
  const status = params.get('status') || 'pending';
  const source = params.get('source');
  const page = Number(params.get('page') || '1');
  if (!statuses.includes(status) || (source && !validSourceId.test(source)) || !Number.isSafeInteger(page) || page < 1 || page > 10_000) {
    return privateJson({ error: 'Invalid review filter.' }, 400);
  }
  const db = createResearchClient();
  if (!db) return privateJson({ error: 'The campus review queue is not configured.' }, 503);
  let query = db.from('campus_feed_items')
    .select('id,source_id,source_label,university_name,title,excerpt,canonical_url,published_at,media_url,media_type,category,status,review_reason,updated_at', { count: 'exact' })
    .eq('status', status);
  if (source) query = query.eq('source_id', source);
  const { data, count, error } = await query
    .order('published_at', { ascending: false, nullsFirst: false }).order('id')
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error && error.code !== 'PGRST103') return privateJson({ error: 'Unable to load the campus feed review queue.' }, 503);
  return privateJson({ items: data || [], total: count || 0, pages: Math.max(1, Math.ceil((count ?? 0) / pageSize)) });
}

export async function POST(request: Request) {
  const auth = await requireResearchAdmin();
  if (!auth.ok) return auth.error;
  if (!acceptsAdminMutation(request)) return privateJson({ error: 'This request must come from UniEco management.' }, 403);
  let body: { id?: unknown; decision?: unknown; reason?: unknown; reviewedVersion?: unknown; sourceConfirmed?: unknown };
  try { body = await readJsonLimited(request, 8 * 1024); }
  catch { return privateJson({ error: 'Invalid or oversized review request.' }, 400); }
  if (!body || typeof body.id !== 'string' || !campusFeedUuid.test(body.id)
    || (body.decision !== 'approved' && body.decision !== 'rejected')
    || typeof body.reason !== 'string' || body.reason.trim().length < 10 || body.reason.trim().length > 500
    || typeof body.reviewedVersion !== 'string' || body.reviewedVersion.length > 64
    || (body.decision === 'approved' && body.sourceConfirmed !== true)) {
    return privateJson({ error: 'Select an update, verify the source before publishing, and add a 10–500 character review note.' }, 400);
  }
  const db = createResearchClient();
  if (!db) return privateJson({ error: 'The campus review queue is not configured.' }, 503);
  const { data: item, error: queueError } = await db.from('campus_feed_items').select('status,updated_at,source_id').eq('id', body.id).maybeSingle();
  if (queueError) return privateJson({ error: 'Could not verify the review item.' }, 503);
  if (!item || item.updated_at !== body.reviewedVersion || item.status === 'rejected'
    || (item.status !== 'pending' && body.decision === 'approved')) {
    return privateJson({ error: 'The item changed since you opened it. Refresh and review it again.' }, 409);
  }
  if (body.decision === 'approved') {
    const { data: source, error } = await db.from('campus_feed_sources').select('enabled').eq('id', item.source_id).maybeSingle();
    if (error || !source?.enabled) return privateJson({ error: 'This publisher is paused. No public update was changed.' }, 409);
  }
  const { data, error } = await auth.supabase.rpc('moderate_campus_feed_item', {
    p_item_id: body.id, p_decision: body.decision, p_reason: body.reason.trim(),
  });
  if (error) return privateJson({ error: 'The review decision could not be saved.' }, 503);
  return privateJson({ result: data });
}
