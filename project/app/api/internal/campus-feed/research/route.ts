import { createHash, timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { privateJson } from '@/lib/ai/admin-access';
import { acquireResearchSlot, createResearchClient, loadResearchCatalog, queueResearchLeads, scanResearchBatch } from '@/lib/ai/research-service';
import { readJsonLimited } from '@/lib/http/read-json-limited';
import { campusFeedUuid } from '@/lib/ai/research-catalog';
import { newsroomEditionTag } from '@/lib/ai/newsroom';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 40;
const sweepWindow = 6 * 3_600_000;
const boundaryGrace = 22 * 60_000;
const staleLeaseAfter = 25 * 60_000; // Longer than the worker's 22-minute hard deadline.

function authorized(request: Request) {
  const provided = Buffer.from(request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1] || '');
  const matches = (expectedValue: string | undefined) => {
    const expected = Buffer.from(expectedValue || '');
    return expected.length >= 32 && provided.length === expected.length && timingSafeEqual(provided, expected);
  };
  if (process.env.UNIECO_ENV === 'production' && matches(process.env.UNIECO_RESEARCH_SCHEDULER_NONCE)) return 'scheduler';
  if (matches(process.env.UNIECO_FEED_INGEST_TOKEN)) return 'operator';
  return null;
}

function researchWindowId(utc: string, suffix: string) {
  const hex = createHash('sha256').update('unieco:campus-research:v2:' + utc + ':' + suffix).digest('hex');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-5' + hex.slice(13, 16) + '-8' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
}

function validRunWindow(value: unknown, allowPreceding: boolean, now = Date.now()) {
  if (typeof value !== 'string' || value.length !== 24) return false;
  const timestamp = Date.parse(value);
  const current = Math.floor(now / sweepWindow) * sweepWindow;
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
    && (timestamp === current || (allowPreceding && timestamp === current - sweepWindow && now - current < boundaryGrace));
}

export async function POST(request: Request) {
  const caller = authorized(request);
  if (!caller) return privateJson({ error: 'Research worker is not authorized.' }, 401);
  let offset = 0;
  let dryRun = false;
  let runId = '';
  let windowUtc = '';
  try {
    const body = await readJsonLimited<{ offset?: number; dryRun?: boolean; runId?: string; windowUtc?: string }>(request, 1024);
    offset = body.offset ?? 0;
    dryRun = body.dryRun === true;
    runId = typeof body.runId === 'string' ? body.runId : '';
    windowUtc = typeof body.windowUtc === 'string' ? body.windowUtc : '';
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000
      || (body.dryRun !== undefined && typeof body.dryRun !== 'boolean')
      || (caller === 'scheduler' && (!campusFeedUuid.test(runId) || !validRunWindow(windowUtc, offset > 0) || dryRun))) throw new Error();
  } catch { return privateJson({ error: 'Invalid research worker request.' }, 400); }
  const db = createResearchClient();
  if (!db) return privateJson({ error: 'Campus research database is unavailable.' }, 503);
  const release = acquireResearchSlot('scheduled-research');
  if (!release) return privateJson({ error: 'Campus research worker is already running.' }, 429);
  let phase = 'lease';
  try {
    if (caller === 'scheduler') {
      // Unique, append-only audit markers also protect against overlapping
      // Railway instances and rolling deploys running the same time window.
      const claim = async (suffix: string, action: string) => {
        const id = researchWindowId(windowUtc, suffix);
        if (offset === 0) {
          const { error } = await db.from('audit_logs').insert({
            id, action, entity_type: 'campus_research',
            metadata: { window_utc: windowUtc, run_id: runId },
          });
          if (error && error.code !== '23505') throw new Error('Unable to claim research window.');
        }
        const { data, error } = await db.from('audit_logs').select('created_at,metadata').eq('id', id).maybeSingle();
        if (error) throw new Error('Unable to verify the research lease.');
        return data;
      };
      const primary = await claim('started', 'campus_research.sweep_started');
      if (primary?.metadata?.run_id !== runId) {
        if (offset === 0) {
          const completed = await db.from('audit_logs').select('id').eq('id', researchWindowId(windowUtc, 'completed')).maybeSingle();
          if (completed.error) throw new Error('Unable to verify sweep completion.');
          if (completed.data) return privateJson({ skipped: true });
        }
        const age = primary ? Date.now() - Date.parse(primary.created_at) : -1;
        if (age < staleLeaseAfter) return offset === 0 ? privateJson({ skipped: true, retryAfterMs: staleLeaseAfter - age + 5_000 })
          : privateJson({ error: 'Research lease no longer belongs to this sweep.' }, 409);
        const recovery = await claim('recovery', 'campus_research.sweep_recovery_started');
        if (recovery?.metadata?.run_id !== runId) return offset === 0 ? privateJson({ skipped: true })
          : privateJson({ error: 'Research lease no longer belongs to this sweep.' }, 409);
      }
    }
    phase = 'catalog';
    const catalog = await loadResearchCatalog(db);
    phase = 'scan';
    const { outcomes, nextOffset, total } = await scanResearchBatch(catalog, offset, request.signal);
    const now = Date.now();
    const freshAfter = new Date(now - 100 * 86_400_000).toISOString();
    const autoPublish = caller === 'scheduler' && process.env.UNIECO_DISABLE_CAMPUS_AUTOPUBLISH !== 'true';
    const report = [];
    const enqueue = async ({ source, state, leads, verifiedArticleKeys }: (typeof outcomes)[number]) => {
      const fresh = leads.filter((lead) => lead.published_at && lead.published_at >= freshAfter)
        .sort((a, b) => (b.published_at || '').localeCompare(a.published_at || '')).slice(0, 2);
      let added = 0;
      let published = 0;
      let error = false;
      if (!dryRun && fresh.length && !request.signal.aborted) {
        try {
          const result = await queueResearchLeads(db, source, fresh, autoPublish ? { verifiedArticleKeys: verifiedArticleKeys || [], now } : undefined);
          ({ added, published = 0 } = result);
        }
        catch { error = true; }
      }
      return { school: source.schoolSlug, source: source.label, state, found: leads.length, datedRecent: fresh.length, added, published, error };
    };
    phase = 'queue';
    for (let index = 0; index < outcomes.length; index += 2) {
      report.push(...await Promise.all(outcomes.slice(index, index + 2).map(enqueue)));
    }
    if (report.some((item) => item.published > 0)) revalidateTag(newsroomEditionTag);
    if (caller === 'scheduler' && nextOffset === null) {
      phase = 'audit';
      const id = researchWindowId(windowUtc, 'completed');
      const schools = catalog.filter((source) => source.schoolSlug);
      const { error } = await db.from('audit_logs').upsert({
        id, action: 'campus_research.sweep_completed', entity_type: 'campus_research',
        metadata: {
          window_utc: windowUtc, run_id: runId, source_records: total, school_records: schools.length,
          schools_with_sources: schools.filter((source) => source.state === 'ready').length,
        },
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw new Error('Unable to record research completion.');
    }
    return privateJson({ total, nextOffset, report, dryRun });
  } catch {
    console.warn('Campus research batch unavailable', { offset, phase });
    return privateJson({ error: 'The campus research batch is unavailable.' }, 503);
  }
  finally { release(); }
}
