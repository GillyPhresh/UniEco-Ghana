export type SourceOption = {
  id: string;
  schoolSlug: string | null;
  label: string;
  website: string | null;
  state: 'ready' | 'missing_source' | 'shared_source' | 'paused';
  registered: boolean;
  feedSourceId: string | null;
};

export type Coverage = { total: number; ready: number; registered: number; pending: number | null; lastSweep: string | null };
export type Candidate = {
  proof: string;
  source_item_key: string;
  title: string;
  excerpt: string;
  canonical_url: string;
  published_at: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  category: string;
};
export type Outcome = {
  source: SourceOption;
  state: SourceOption['state'] | 'found' | 'no_updates' | 'unreachable';
  leads: Candidate[];
};
export const coverageLabels: Record<Outcome['state'], string> = {
  ready: 'Ready to scan', missing_source: 'Verified website needed', shared_source: 'Shared publisher · needs review', paused: 'Paused',
  found: 'Leads found', no_updates: 'No matching stories returned', unreachable: 'Publisher unavailable',
};

export async function editorialRequest<T>(action: string, data: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/admin/ai', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...data }), signal,
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}
