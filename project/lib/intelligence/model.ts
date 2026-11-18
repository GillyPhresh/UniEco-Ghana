export const intelligenceTopics = [
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'events', label: 'Events' },
  { id: 'notices', label: 'Notices' },
  { id: 'research', label: 'Research' },
  { id: 'news', label: 'Campus news' },
  { id: 'campus_life', label: 'Campus life' },
] as const;
export type IntelligenceTopic = (typeof intelligenceTopics)[number]['id'];
export type IntelligenceWindow = 7 | 30;
export type CampusDemand = { slug: string; name: string; searchDays: number; noMatchDays: number | null };
export type ContentSupply = { topic: IntelligenceTopic; approved: number };
export type SignalCard = {
  id: string; title: string; detail: string; severity: 'review' | 'opportunity' | 'info'; href: string; action: string;
};
export type IntelligenceSnapshot = {
  checkedAt: string;
  days: IntelligenceWindow;
  searches: { total: number; noMatch: number } | null;
  campuses: CampusDemand[] | null;
  security: { recordedEvents: number; paymentsNeedingReview: number } | null;
  operations: { exhausted: number; stuck: number; aged: number } | null;
  content: ContentSupply[] | null;
  suggestions: SignalCard[];
};
export type Recommendation = { id: string; title: string; sourceLabel: string; publishedAt: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sourcePattern = /^[a-z0-9-]{2,48}$/;
export const recommendationWindow = 30;
export const recommendationLimit = 6;

export function parseRecommendationQuery(params: URLSearchParams): { topic: IntelligenceTopic; source: string | null } | null {
  const topic = intelligenceTopics.find(({ id }) => id === params.get('topic'))?.id;
  const source = params.get('source');
  return topic && (source === null || sourcePattern.test(source)) && params.getAll('topic').length === 1
    && params.getAll('source').length <= 1 ? { topic, source } : null;
}

function bag(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function count(value: unknown): number | null {
  const n = typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : value;
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function cleanSignals(value: unknown) {
  const data = bag(value);
  const rows = Array.isArray(data.campuses) ? data.campuses.slice(0, 12) : null;
  const campuses = rows?.flatMap((value): CampusDemand[] => {
    const row = bag(value);
    const searchDays = count(row.searchDays);
    const noMatchDays = count(row.noMatchDays);
    return typeof row.slug === 'string' && /^[a-z0-9-]{1,160}$/.test(row.slug) && typeof row.name === 'string'
      && searchDays !== null && (noMatchDays === null || noMatchDays <= searchDays)
      ? [{ slug: row.slug, name: row.name.slice(0, 180), searchDays, noMatchDays }] : [];
  }) ?? null;
  const security = bag(data.security);
  const recordedEvents = count(security.recordedEvents);
  const paymentsNeedingReview = count(security.paymentsNeedingReview);
  return { campuses, security: recordedEvents === null || paymentsNeedingReview === null ? null : { recordedEvents, paymentsNeedingReview } };
}

export function cleanSearchCounts(value: unknown): IntelligenceSnapshot['searches'] {
  if (!Array.isArray(value) || value.length > 30) return null;
  let total = 0;
  let noMatch = 0;
  for (const row of value) {
    const searches = count(bag(row).searches);
    const empty = count(bag(row).no_result_searches);
    if (searches === null || empty === null || empty > searches) return null;
    total += searches; noMatch += empty;
  }
  return Number.isSafeInteger(total) ? { total, noMatch } : null;
}

export function cleanQueueCounts(value: unknown): IntelligenceSnapshot['operations'] {
  const queue = bag(bag(value).communicationQueue);
  const exhausted = count(queue.exhausted);
  const stuck = count(queue.stuckProcessing);
  const aged = count(queue.agedQueued);
  return exhausted === null || stuck === null || aged === null ? null : { exhausted, stuck, aged };
}

export function selectRecommendations(rows: unknown, now: number, focus: IntelligenceTopic, source: string | null) {
  if (!Array.isArray(rows)) return [];
  const candidates = rows.slice(0, 36).flatMap((item) => {
    const row = bag(item);
    const stamp = typeof row.published_at === 'string' ? Date.parse(row.published_at) : NaN;
    if (!Number.isFinite(stamp) || stamp < now - recommendationWindow * 86_400_000 || stamp > now
      || row.category !== focus || typeof row.id !== 'string' || !uuid.test(row.id)
      || typeof row.source_id !== 'string' || !sourcePattern.test(row.source_id)
      || (source !== null && row.source_id !== source)
      || typeof row.title !== 'string' || !row.title.trim() || typeof row.source_label !== 'string') return [];
    return [{ id: row.id, title: row.title.slice(0, 220), sourceLabel: row.source_label.slice(0, 160),
      publishedAt: new Date(stamp).toISOString(), source: row.source_id, stamp }];
  }).sort((a, b) => b.stamp - a.stamp || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  const items: Recommendation[] = [];
  for (const row of candidates) {
    const used = counts.get(row.source) ?? 0;
    if (seen.has(row.id) || (!source && used >= 2)) continue;
    seen.add(row.id);
    counts.set(row.source, used + 1);
    items.push({ id: row.id, title: row.title, sourceLabel: row.sourceLabel, publishedAt: row.publishedAt });
    if (items.length >= recommendationLimit) break;
  }
  return items;
}

export function rankIntelligence(data: Omit<IntelligenceSnapshot, 'suggestions'>): SignalCard[] {
  const items: SignalCard[] = [];
  const queue = data.operations;
  if (queue && (queue.stuck || queue.exhausted)) items.push({
    id: 'queue', title: 'Review stalled communications', severity: 'review',
    detail: `${queue.stuck} stuck in processing · ${queue.exhausted} have exhausted retries. Check delivery before retrying.`,
    href: '/admin/system-health', action: 'Open system health',
  });
  else if (queue?.aged) items.push({
    id: 'queue-age', title: 'Check delayed communications', severity: 'review',
    detail: `${queue.aged} communications have been queued for at least 15 minutes. Check the worker and delivery status.`,
    href: '/admin/system-health', action: 'Open system health',
  });
  if (data.security?.paymentsNeedingReview) items.push({
    id: 'payment-review', title: 'Reconcile payments that need review', severity: 'review',
    detail: `${data.security.paymentsNeedingReview} payments are flagged for review. Verify with the provider before changing any payment state.`,
    href: '/admin/payments', action: 'Review payments',
  });
  if (data.security?.recordedEvents) items.push({
    id: 'security-events', title: 'Review recorded security activity', severity: 'info',
    detail: `${data.security.recordedEvents} events recorded in the selected window. The count alone does not establish an incident.`,
    href: '/admin/system-health', action: 'Open system health',
  });
  const campus = data.campuses?.find(entry => entry.noMatchDays !== null && entry.noMatchDays >= 5
    && entry.searchDays >= 10 && entry.noMatchDays / entry.searchDays >= 0.2);
  if (campus) items.push({
    id: 'campus-gap', title: 'Investigate search gaps in ' + campus.name, severity: 'opportunity',
    detail: `${campus.noMatchDays} of ${campus.searchDays} capped search days included a no-match result. Review listing coverage and ask students what is missing.`,
    href: '/admin/campus-discovery', action: 'Review campus listings',
  });
  if (data.searches && data.searches.total >= 20 && data.searches.noMatch / data.searches.total >= 0.2) items.push({
    id: 'search-gap', title: 'Review marketplace and platform search', severity: 'opportunity',
    detail: `${data.searches.noMatch} of ${data.searches.total} recorded searches had no results. Check listing coverage and search synonyms.`,
    href: '/admin/search', action: 'Open search quality',
  });
  const lowSupply = data.content?.filter(item => item.approved < 3)
    .slice(0, 3).map(item => intelligenceTopics.find(topic => topic.id === item.topic)?.label).filter(Boolean);
  if (lowSupply?.length) items.push({
    id: 'editorial-supply', title: 'Scan official publishers for fresh updates', severity: 'opportunity',
    detail: `Fewer than three approved recent stories in: ${lowSupply.join(', ')}. This is a supply gap, not evidence of reader demand.`,
    href: '/admin/ai?tab=research', action: 'Open publisher research',
  });
  return items;
}
