import { createClient } from '@/lib/supabase/server';
import { validSourceId } from './research-catalog';
import type { FlyerItem } from './flyer';

export const bulletinPageSize = 3;
export type BulletinFilter = { source: string; days: '7' | '30' | '90' | 'all'; page: number };
export type BulletinItem = FlyerItem & { canonical_url: string };

export function parseBulletinFilter(query: URLSearchParams): BulletinFilter | null {
  const source = query.get('source') || 'all';
  const days = query.get('days') || '30';
  const page = Number(query.get('page') || '1');
  if (!validSourceId.test(source) || !['7', '30', '90', 'all'].includes(days)
    || !Number.isSafeInteger(page) || page < 1 || page > 10_000) return null;
  return { source, days: days as BulletinFilter['days'], page };
}

export function bulletinQuery(filter: BulletinFilter) {
  return new URLSearchParams({ source: filter.source, days: filter.days, page: String(filter.page) }).toString();
}

export async function loadBulletin(filter: BulletinFilter) {
  const db = await createClient();
  const { data: sources, error: sourceError } = await db.from('campus_feed_public_sources')
    .select('source_id,source_label,university_name').order('university_name').order('source_id').limit(1000);
  if (sourceError) throw new Error('Campus bulletin sources unavailable.');
  const source = sources.find((entry) => entry.source_id === filter.source);
  if (filter.source !== 'all' && !source) return null;
  const offset = (filter.page - 1) * bulletinPageSize;
  let query = db.from('campus_feed_public_items')
    .select('id,title,excerpt,category,source_label,university_name,canonical_url,published_at', { count: 'exact' });
  if (source) query = query.eq('source_id', source.source_id);
  if (filter.days !== 'all') query = query.gte('published_at', new Date(Date.now() - Number(filter.days) * 86_400_000).toISOString());
  const { data, count, error } = await query.order('published_at', { ascending: false, nullsFirst: false }).order('id')
    .range(offset, offset + bulletinPageSize - 1);
  if (error && error.code !== 'PGRST103') throw new Error('Campus bulletin unavailable.');
  const pages = Math.max(1, Math.ceil((count ?? 0) / bulletinPageSize));
  if (filter.page > pages || error) return null;
  return {
    items: (data || []) as BulletinItem[], sources, pages, total: count ?? 0, page: filter.page,
    heading: source?.university_name || 'All campuses and national opportunities',
    period: filter.days === 'all' ? 'All approved updates' : 'Last ' + filter.days + ' days',
    link: 'uniecoghana.com/updates/bulletin?' + bulletinQuery(filter),
  };
}
