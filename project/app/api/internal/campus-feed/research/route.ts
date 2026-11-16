import { createHash, timingSafeEqual } from 'node:crypto';
import { privateJson } from '@/lib/ai/admin-access';
import { acquireResearchSlot, createResearchClient, loadResearchCatalog, queueResearchLeads, scanResearchBatch } from '@/lib/ai/research-service';
import { readJsonLimited } from '@/lib/http/read-json-limited';
import { campusFeedUuid } from '@/lib/ai/research-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 35;

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

function researchWindowId(suffix: string) {
  const utc = new Date(Math.floor(Date.now() / (6 * 3_600_000)) * 6 * 3_600_000).toISOString();
  const hex = createHash('sha256').update('unieco:campus-research:v1:' + utc + ':' + suffix).digest('hex');
  return { id: hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-5' + hex.slice(13, 16) + '-8' + hex.slice(17, 20) + '-' + hex.slice(20, 32), utc };
}

export async function POST(request: Request) {
  const caller = authorized(request);
  if (!caller) return privateJson({ error: 'Research worker is not authorized.' }, 401);
  let offset = 0;
  let dryRun = false;
  let runId = '';
  try {
    const body = await readJsonLimited<{ offset?: number; dryRun?: boolean; runId?: string }>(request, 1024);
    offset = body.offset ?? 0;
    dryRun = body.dryRun === true;
    runId = typeof body.runId === 'string' ? body.runId : '';
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000
      || (body.dryRun !== undefined && typeof body.dryRun !== 'boolean')
      || (caller === 'scheduler' && !campusFeedUuid.test(runId))) throw new Error();
  } catch { return privateJson({ error: 'Invalid research worker request.' }, 400); }
  const db = createResearchClient();
  if (!db) return privateJson({ error: 'Campus research database is unavailable.' }, 503);
  const release = acquireResearchSlot('scheduled-research');
  if (!release) return privateJson({ error: 'Campus research worker is already running.' }, 429);
  try {
    if (caller === 'scheduler') {
      // Unique, append-only audit markers also protect against overlapping
      // Railway instances and rolling deploys running the same time window.
      const { id, utc } = researchWindowId('started');
      if (offset === 0) {
        const { error } = await db.from('audit_logs').insert({
          id, action: 'campus_research.sweep_started', entity_type: 'campus_research',
          metadata: { window_utc: utc, run_id: runId },
        });
        if (error && error.code !== '23505') throw new Error('Unable to claim research window.');
      }
      const { data, error } = await db.from('audit_logs').select('metadata').eq('id', id).maybeSingle();
      if (error) throw new Error('Unable to verify the research lease.');
      if (data?.metadata?.run_id !== runId) return privateJson({ skipped: true });
    }
    const catalog = await loadResearchCatalog(db);
    const { outcomes, nextOffset, total } = await scanResearchBatch(catalog, offset, request.signal);
    const freshAfter = new Date(Date.now() - 100 * 86_400_000).toISOString();
    const report = [];
    for (const { source, state, leads } of outcomes) {
      const fresh = leads.filter((lead) => lead.published_at && lead.published_at >= freshAfter).slice(0, 2);
      let added = 0;
      let error = false;
      if (!dryRun && fresh.length && !request.signal.aborted) {
        try { added = (await queueResearchLeads(db, source, fresh)).added; }
        catch { error = true; }
      }
      report.push({ school: source.schoolSlug, source: source.label, state, found: leads.length, datedRecent: fresh.length, added, error });
    }
    if (caller === 'scheduler' && nextOffset === null) {
      const { id, utc } = researchWindowId('completed');
      const schools = catalog.filter((source) => source.schoolSlug);
      const { error } = await db.from('audit_logs').upsert({
        id, action: 'campus_research.sweep_completed', entity_type: 'campus_research',
        metadata: {
          window_utc: utc, run_id: runId, source_records: total, school_records: schools.length,
          schools_with_sources: schools.filter((source) => source.state === 'ready').length,
        },
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw new Error('Unable to record research completion.');
    }
    return privateJson({ total, nextOffset, report, dryRun });
  } catch { return privateJson({ error: 'The campus research batch is unavailable.' }, 503); }
  finally { release(); }
}
