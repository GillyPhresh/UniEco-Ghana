import { privateJson, requireResearchAdmin } from '@/lib/ai/admin-access';
import { cleanQueueCounts, cleanSearchCounts, cleanSignals, intelligenceTopics, rankIntelligence,
  type ContentSupply, type IntelligenceSnapshot } from '@/lib/intelligence/model';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
let activeSnapshots = 0;

export async function GET(request: Request) {
  const auth = await requireResearchAdmin();
  if (!auth.ok) return auth.error;
  const window = new URL(request.url).searchParams.get('days') ?? '7';
  if (window !== '7' && window !== '30') return privateJson({ error: 'Choose a 7 or 30 day report.' }, 400);
  const days = window === '7' ? 7 : 30;
  if (activeSnapshots >= 3) return privateJson({ error: 'Intelligence is busy. Please try again shortly.' }, 429);
  activeSnapshots++;
  try {
    const checkedAt = new Date();
    const since = new Date(checkedAt.getTime() - days * 86_400_000).toISOString();
    const bounded = AbortSignal.timeout(6500);
    // Caller-scoped credentials and bounded queries only. No service-role
    // key, arbitrary table names, or user-specified URLs in this API.
    const [queue, search, details, content] = await Promise.allSettled([
      auth.supabase.rpc('get_admin_system_health_summary').abortSignal(bounded),
      auth.supabase.rpc('get_admin_search_quality_metrics', { p_days: days }).abortSignal(bounded),
      auth.supabase.rpc('get_admin_platform_intelligence', { p_days: days }).abortSignal(bounded),
      Promise.all(intelligenceTopics.map(async ({ id }): Promise<ContentSupply> => {
        const { count, error } = await auth.supabase.from('campus_feed_public_items')
          .select('id', { count: 'exact', head: true }).eq('category', id).gte('published_at', since)
          .lte('published_at', checkedAt.toISOString()).abortSignal(bounded);
        if (error || count === null || !Number.isSafeInteger(count) || count < 0) throw new Error('Public content count unavailable.');
        return { topic: id, approved: count };
      })),
    ]);
    const data = <T extends { data: unknown; error: unknown }>(result: PromiseSettledResult<T>) =>
      result.status === 'fulfilled' && !result.value.error ? result.value.data : null;
    const signals = cleanSignals(data(details));
    const snapshot: Omit<IntelligenceSnapshot, 'suggestions'> = {
      checkedAt: checkedAt.toISOString(), days,
      searches: cleanSearchCounts(data(search)), operations: cleanQueueCounts(data(queue)),
      ...signals, content: content.status === 'fulfilled' ? content.value : null,
    };
    if (!snapshot.searches && !snapshot.operations && !snapshot.content && !snapshot.campuses && !snapshot.security) {
      return privateJson({ error: 'No intelligence signals could be reached. Please retry.' }, 503);
    }
    return privateJson({ ...snapshot, suggestions: rankIntelligence(snapshot) });
  } finally { activeSnapshots--; }
}
