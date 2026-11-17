import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient as createSupabase, type SupabaseClient } from '@supabase/supabase-js';
import { getCuratedCampusProfile, getLocalUniversityBranding } from '@/lib/data/university-branding';
import { articleIdentity, publicSourceUrl, sourceLink } from './public-source-url';
import { buildResearchCatalog, researchBatchSize, type FeedRegistration, type ResearchSchool, type ResearchSource } from './research-catalog';
import { feedCategories, scanResearchSource, type ResearchLead } from './research';
import { automatedReviewReason, canAutomaticallyPublish } from './editorial-policy';

export function createResearchClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createSupabase(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export async function loadResearchCatalog(db: SupabaseClient) {
  const pageSize = 200;
  const schools: ResearchSchool[] = [];
  const registrations: FeedRegistration[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const [directory, registry] = await Promise.all([
      db.from('universities').select('id,slug,name,official_name,short_name,website_url')
        .eq('is_enabled', true).order('name').order('id').range(offset, offset + pageSize - 1),
      db.from('campus_feed_sources').select('id,label,university_name,website_url,feed_url,source_domain,source_kind,enabled')
        .order('id').range(offset, offset + pageSize - 1),
    ]);
    if (directory.error || registry.error) throw new Error('Campus source catalog is unavailable.');
    schools.push(...((directory.data || []) as ResearchSchool[]));
    registrations.push(...((registry.data || []) as FeedRegistration[]));
    if (directory.data.length < pageSize && registry.data.length < pageSize) break;
  }
  return buildResearchCatalog(schools.map((school) => ({
    ...school, curatedWebsite: getLocalUniversityBranding(school.slug).website,
    curatedNews: getCuratedCampusProfile(school.slug)?.news,
  })), registrations);
}

const activeScans = new Set<string>();

export function acquireResearchSlot(key: string) {
  if (activeScans.has(key) || activeScans.size >= 2) return null;
  activeScans.add(key);
  return () => { activeScans.delete(key); };
}

export async function scanResearchBatch(catalog: ResearchSource[], offset: number, signal: AbortSignal, only?: string) {
  const targets = only ? catalog.filter((source) => source.id === only) : catalog.slice(offset, offset + researchBatchSize);
  const outcomes = await Promise.all(targets.map(async (source) => {
    const result = await scanResearchSource(source, signal).catch(() => ({ state: 'unreachable' as const, leads: [], verifiedArticleKeys: [] }));
    return { source, ...result };
  }));
  return {
    outcomes,
    total: only ? targets.length : catalog.length,
    nextOffset: !only && offset + targets.length < catalog.length ? offset + targets.length : null,
  };
}

function bindingFor(userId: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) throw new Error('Campus research signing is unavailable.');
  return createHmac('sha256', secret).update('unieco:research-lead:v1:').update(userId).digest();
}

export function issueResearchLead(source: ResearchSource, lead: ResearchLead, userId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ source: source.id, lead, expiry: now + 30 * 60_000 })).toString('base64url');
  const sig = createHmac('sha256', bindingFor(userId)).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyResearchLead(token: unknown, userId: string, now = Date.now()): { source: string; lead: ResearchLead } | null {
  if (typeof token !== 'string' || token.length > 9_000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  try {
    const [payload, proof] = token.split('.');
    const expected = createHmac('sha256', bindingFor(userId)).update(payload).digest();
    const actual = Buffer.from(proof, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { source: string; lead: ResearchLead; expiry: number };
    return data.expiry > now ? data : null;
  } catch { return null; }
}

export function leadMatchesSource(source: ResearchSource, lead: ResearchLead) {
  if (source.state !== 'ready' || !source.registration || !source.website || lead.source_id !== source.registration.id) return false;
  const original = publicSourceUrl(lead.canonical_url);
  const asset = publicSourceUrl(lead.media_url);
  return Boolean(original && sourceLink(original.href, source.website, source.hosts)
    && /^[a-f0-9]{64}$/.test(lead.source_item_key) && lead.title.length >= 8 && lead.title.length <= 440
    && feedCategories.includes(lead.category)
    && (lead.media_url ? asset && sourceLink(asset.href, source.website, source.hosts)
      && (lead.media_type === 'image' || lead.media_type === 'video') : lead.media_type === null));
}

/** Only the authenticated scheduler supplies in-process article evidence. No
 * manual ingest, review endpoint or AI chat prompt can request publication. */
export async function queueResearchLeads(db: SupabaseClient, source: ResearchSource, candidates: ResearchLead[],
  automation?: { verifiedArticleKeys: string[]; now: number }) {
  const registration = source.registration;
  const leads = Array.from(new Map(candidates.filter((lead) => leadMatchesSource(source, lead))
    .map((lead) => [articleIdentity(lead.canonical_url), lead])).values()).slice(0, 5);
  if (!registration || !leads.length) return { added: 0, existing: leads.length };
  if (!source.registered) {
    const insert = await db.from('campus_feed_sources').upsert(registration, { onConflict: 'id', ignoreDuplicates: true });
    if (insert.error) throw new Error('School feed source could not be registered.');
  }
  const { data: current, error: sourceError } = await db.from('campus_feed_sources')
    .select('id,label,university_name,website_url,feed_url,source_domain,source_kind,enabled').eq('id', registration.id).maybeSingle();
  if (sourceError || !current?.enabled || current.source_domain !== registration.source_domain
    || current.website_url !== registration.website_url || current.feed_url !== registration.feed_url
    || current.university_name !== registration.university_name || current.source_kind !== registration.source_kind) {
    throw new Error('School feed source changed. Scan the source again.');
  }

  // Respect records created by the legacy importer even if it used a different
  // hash for the same canonical page.
  const variants = Array.from(new Set(leads.flatMap((lead) => {
    const original = new URL(lead.canonical_url);
    const alternate = new URL(original.href);
    alternate.hostname = original.hostname.startsWith('www.') ? original.hostname.slice(4) : 'www.' + original.hostname;
    return [original, alternate].flatMap((base) => {
      const slash = new URL(base.href);
      slash.pathname = slash.pathname.endsWith('/') ? slash.pathname.slice(0, -1) || '/' : slash.pathname + '/';
      return [base.href, slash.href];
    });
  })));
  const { data: existing, error: queryError } = await db.from('campus_feed_items').select(automation
    ? 'id,canonical_url,status,source_item_key,title,excerpt,published_at,category,media_url,media_type,updated_at'
    : 'canonical_url')
    .eq('source_id', registration.id).in('canonical_url', variants);
  if (queryError) throw new Error('Campus review queue is unavailable.');
  const history = (existing || []) as unknown as Array<Pick<ResearchLead, 'canonical_url' | 'source_item_key' | 'title' | 'excerpt' | 'published_at' | 'category' | 'media_url' | 'media_type'>
    & { id: string; status: string; updated_at: string }>;
  const seen = new Set(history.flatMap((item) => publicSourceUrl(item.canonical_url) ? [articleIdentity(item.canonical_url)] : []));
  const verified = new Set(automation?.verifiedArticleKeys || []);
  const eligible = automation && leads.find((lead) => canAutomaticallyPublish(source, lead, verified, automation.now));
  const approval = { status: 'approved', approved_by: null, approved_at: automation ? new Date(automation.now).toISOString() : null, review_reason: automatedReviewReason };
  let published = 0;
  if (eligible && seen.has(articleIdentity(eligible.canonical_url))) {
    const matching = history.filter((row) => publicSourceUrl(row.canonical_url) && articleIdentity(row.canonical_url) === articleIdentity(eligible.canonical_url));
    const prior = matching.length === 1 && matching[0];
    // Promote only an unchanged, exact research record. Respect any previous
    // rejection, manual copy or conflicting legacy import.
    if (prior && prior.status === 'pending' && prior.source_item_key === eligible.source_item_key && prior.canonical_url === eligible.canonical_url
      && prior.title === eligible.title && prior.excerpt === eligible.excerpt && prior.category === eligible.category
      && prior.media_url === eligible.media_url && prior.media_type === eligible.media_type
      && Date.parse(prior.published_at || '') === Date.parse(eligible.published_at || '')) {
      const { data, error } = await db.from('campus_feed_items').update({ ...approval, updated_at: approval.approved_at })
        .eq('id', prior.id).eq('source_id', registration.id).eq('status', 'pending').eq('updated_at', prior.updated_at).select('id');
      if (error) throw new Error('Automatic campus publication could not be saved.');
      published = data?.length || 0;
    }
  }
  const entries = leads.filter((lead) => !seen.has(articleIdentity(lead.canonical_url))).map((lead) => ({
    ...lead, source_label: current.label, university_name: current.university_name,
    title: Array.from(lead.title).slice(0, 220).join(''),
    excerpt: Array.from(lead.excerpt).slice(0, 600).join(''),
    ...(eligible === lead ? approval : { status: 'pending', approved_at: null, approved_by: null, review_reason: null }),
  }));
  if (!entries.length) return { added: 0, existing: leads.length, ...(automation ? { published } : {}) };
  const { data, error } = await db.from('campus_feed_items')
    .upsert(entries, { onConflict: 'source_id,source_item_key', ignoreDuplicates: true }).select(automation ? 'id,status' : 'id');
  if (error) throw new Error('Updates could not be queued for review.');
  const added = (data || []) as unknown as { id: string; status?: string }[];
  return { added: added.length, existing: leads.length - added.length,
    ...(automation ? { published: published + added.filter((item) => item.status === 'approved').length } : {}) };
}

export function displayResearchSource(source: ResearchSource) {
  return { id: source.id, schoolSlug: source.schoolSlug, label: source.label, state: source.state,
    website: source.website, registered: source.registered, feedSourceId: source.registration?.id ?? null };
}
