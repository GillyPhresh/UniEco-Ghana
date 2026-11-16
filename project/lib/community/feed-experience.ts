export type FeedScope = 'all' | 'university' | 'following';

type FeedEntry = { id: string; author_id: string; created_at: string; media_type: string; media_url: string | null };

export function getCampusMoments<T extends FeedEntry>(posts: readonly T[], limit = 7): T[] {
  if (limit < 1) return [];
  const authors = new Set<string>();
  const moments: T[] = [];
  for (const post of posts) {
    if (!post.media_url || (post.media_type !== 'image' && post.media_type !== 'video') || authors.has(post.author_id)) continue;
    moments.push(post);
    authors.add(post.author_id);
    if (moments.length === limit) break;
  }
  return moments;
}

export function pageCampusFeed<T extends Pick<FeedEntry, 'id' | 'created_at'>>(
  rows: readonly T[], pageSize: number, linkedPost?: T,
) {
  const last = rows[rows.length - 1];
  return {
    entries: linkedPost && !rows.some((row) => row.id === linkedPost.id) ? [linkedPost, ...rows] : [...rows],
    cursor: last ? { created_at: last.created_at, id: last.id } : null,
    hasMore: rows.length === pageSize,
  };
}

export function appendCampusFeed<T extends Pick<FeedEntry, 'id'>>(current: readonly T[], next: readonly T[]): T[] {
  const seen = new Set(current.map((post) => post.id));
  return [...current, ...next.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  })];
}

type MediaBounds = { top: number; bottom: number };

export function chooseFeedPlayback<T>(
  items: readonly (MediaBounds & { id: T; playable: boolean })[], viewport: MediaBounds, manual: T | null,
) {
  const height = viewport.bottom - viewport.top;
  const center = (viewport.top + viewport.bottom) / 2;
  const ranked = items.map((item) => ({
    ...item,
    visible: Math.max(0, Math.min(viewport.bottom, item.bottom) - Math.max(viewport.top, item.top)),
    ratio: 0,
    distance: Math.abs((item.top + item.bottom) / 2 - center),
  }));
  for (const item of ranked) item.ratio = item.visible / Math.max(1, Math.min(height, item.bottom - item.top));
  const playable = ranked.filter((item) => item.playable && item.bottom > item.top);
  const current = playable.find((item) => item.id === manual && item.ratio >= 0.2)
    ?? playable.filter((item) => item.ratio >= 0.52).sort((a, b) => a.distance - b.distance || b.ratio - a.ratio)[0];
  const preload = playable.filter((item) => item.id !== current?.id && item.bottom > viewport.top
    && item.top < viewport.bottom + Math.min(460, height * 0.7)).sort((a, b) => a.distance - b.distance)[0];
  return { active: current?.id ?? null, preload: preload?.id ?? null };
}

export type FeedTap = { x: number; y: number; at: number };

export function isFeedDoubleTap(first: FeedTap, second: FeedTap) {
  return second.at - first.at >= 35 && second.at - first.at <= 325
    && Math.hypot(second.x - first.x, second.y - first.y) <= 28;
}

export function feedAspectRatio(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  return Math.max(4 / 5, Math.min(2, width / height));
}
