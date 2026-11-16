import { acceptsAdminMutation, privateJson, requireResearchAdmin } from '@/lib/ai/admin-access';
import { askUniEcoAi, createUniEcoAiDraft, rankEditorialEvidence } from '@/lib/ai/assistant';
import { campusFeedUuid } from '@/lib/ai/research-catalog';
import { acquireResearchSlot, createResearchClient, displayResearchSource, issueResearchLead, loadResearchCatalog, queueResearchLeads, scanResearchBatch, verifyResearchLead } from '@/lib/ai/research-service';
import { publicSourceUrl, sourceLink } from '@/lib/ai/public-source-url';
import { updateSummary } from '@/lib/ai/update-copy';
import { readJsonLimited, RequestBodyTooLargeError } from '@/lib/http/read-json-limited';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 35;

export async function GET() {
  const auth = await requireResearchAdmin();
  if (!auth.ok) return auth.error;
  const db = createResearchClient();
  if (!db) return privateJson({ error: 'Campus research is not configured on this deployment.' }, 503);
  try {
    const catalog = await loadResearchCatalog(db);
    const schools = catalog.filter((source) => source.schoolSlug);
    const [pending, lastSweep] = await Promise.all([
      db.from('campus_feed_items').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('audit_logs').select('created_at').eq('action', 'campus_research.sweep_completed')
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return privateJson({
      providerFree: true, mode: 'provider-free',
      sources: catalog.map(displayResearchSource),
      schoolCoverage: {
        total: schools.length,
        ready: schools.filter((source) => source.state === 'ready').length,
        registered: schools.filter((source) => source.state === 'ready' && source.registered).length,
        pending: pending.error ? null : pending.count,
        lastSweep: lastSweep.data?.created_at || null,
      },
    });
  } catch { return privateJson({ error: 'The school directory could not be loaded. Please retry.' }, 503); }
}

export async function POST(request: Request) {
  const auth = await requireResearchAdmin();
  if (!auth.ok) return auth.error;
  if (!acceptsAdminMutation(request)) return privateJson({ error: 'This request must come from UniEco management.' }, 403);
  let body: Record<string, unknown>;
  try {
    const raw = await readJsonLimited<unknown>(request, 16 * 1024);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SyntaxError();
    body = raw as Record<string, unknown>;
  } catch (error) {
    return privateJson({ error: 'Invalid or oversized request.' }, error instanceof RequestBodyTooLargeError ? 413 : 400);
  }
  const { action } = body;
  const db = createResearchClient();
  if (!db) return privateJson({ error: 'Campus research is not configured on this deployment.' }, 503);
  if (action === 'test') {
    const { error } = await db.from('campus_feed_sources').select('id').limit(1);
    return error ? privateJson({ error: 'The campus research catalog could not be checked.' }, 503)
      : privateJson({ ok: true, message: 'Campus research and the review queue are reachable. No paid provider is enabled.' });
  }
  if (action === 'discover') {
    const sourceId = typeof body.sourceId === 'string' && body.sourceId.length <= 128 ? body.sourceId : undefined;
    const offset = body.offset === undefined ? 0 : Number(body.offset);
    if ((!sourceId && body.sourceId !== undefined) || !Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) {
      return privateJson({ error: 'Select a valid school or scan page.' }, 400);
    }
    const release = acquireResearchSlot(auth.userId);
    if (!release) return privateJson({ error: 'Campus research is busy. Retry in a moment.' }, 429);
    try {
      const catalog = await loadResearchCatalog(db);
      if (sourceId && !catalog.some((source) => source.id === sourceId)) return privateJson({ error: 'Selected school or source is unavailable.' }, 400);
      const { outcomes, nextOffset, total } = await scanResearchBatch(catalog, offset, request.signal, sourceId);
      return privateJson({
        nextOffset, total,
        outcomes: outcomes.map(({ source, state, leads }) => ({
          source: displayResearchSource(source), state,
          leads: leads.map((lead) => ({ ...lead, proof: issueResearchLead(source, lead, auth.userId) })),
        })),
      });
    } catch { return privateJson({ error: 'This research batch could not be completed. Retry the same batch.' }, 503); }
    finally { release(); }
  }
  if (action === 'queue') {
    const signed = verifyResearchLead(body.proof, auth.userId);
    if (!signed) return privateJson({ error: 'This lead expired or changed. Scan the source again.' }, 400);
    try {
      const source = (await loadResearchCatalog(db)).find((entry) => entry.id === signed.source);
      if (!source) return privateJson({ error: 'The publisher is no longer in the campus directory.' }, 409);
      const result = await queueResearchLeads(db, source, [signed.lead]);
      if (!result.added && !result.existing) return privateJson({ error: 'The verified publisher changed. Scan again.' }, 409);
      return privateJson(result);
    } catch { return privateJson({ error: 'This update could not be queued. No update was made public.' }, 503); }
  }
  if (action === 'chat') {
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 800) : '';
    if (!message) return privateJson({ error: 'Enter a question for UniEco AI.' }, 400);
    try {
      const healthQuestion = /\b(?:system health|payment provider|communication queue|delivery status)\b/i.test(message);
      if (healthQuestion) {
        const { data: health } = await auth.supabase.rpc('get_admin_system_health_summary');
        const result = await askUniEcoAi({ messages: [{ role: 'user', content: message }], context: JSON.stringify({ systemHealth: health }) });
        return privateJson({ reply: result.text, citations: [] });
      }
      const catalog = await loadResearchCatalog(db);
      const school = catalog.find((source) => source.id === body.sourceId)
        || catalog.find((source) => source.schoolSlug && source.label.length >= 5 && message.toLowerCase().includes(source.label.toLowerCase()));
      const category = /\b(?:scholarships?|funding|internships?|admissions?|opportunities)\b/i.test(message) ? 'opportunities'
        : /\b(?:events?|workshops?|conferences?)\b/i.test(message) ? 'events'
        : /\b(?:research|publications)\b/i.test(message) ? 'research'
        : /\b(?:notices?|timetables?|deadlines?)\b/i.test(message) ? 'notices' : null;
      if (/\b(?:coverage|missing sources?|how many schools|audit sources)\b/i.test(message)) {
        const schools = catalog.filter((entry) => entry.schoolSlug);
        const ready = schools.filter((entry) => entry.state === 'ready').length;
        const reply = [
          ready + ' of ' + schools.length + ' school profiles have a source ready to scan. This measures source configuration, not successful publication.',
          'The other ' + (schools.length - ready) + ' need a verified website, a distinct campus source, or a paused source reviewed.',
          'Use the Coverage tab to see every school and its last result for your scan.',
        ].join('\n\n');
        return privateJson({ reply, citations: [] });
      }
      if (school || category || /\b(?:briefing|summari[sz]e|digest|bulletin|latest|news|updates?|review queue)\b/i.test(message)) {
        const pending = /\b(?:pending|unreviewed|review queue)\b/i.test(message);
        const windowStart = new Date(Date.now() - 30 * 86_400_000).toISOString();
        let query = pending
          ? db.from('campus_feed_items').select('id,title,excerpt,source_label,canonical_url,published_at').eq('status', 'pending')
          : db.from('campus_feed_public_items').select('id,title,excerpt,source_label,canonical_url,published_at');
        if (school && !school.registration) return privateJson({ reply: 'No verified publication source is connected for ' + school.label + '. I cannot report current news for it yet.', citations: [] });
        if (school?.registration) query = query.eq('source_id', school.registration.id);
        if (category) query = query.eq('category', category);
        if (!pending) query = query.gte('published_at', windowStart);
        const { data, error } = await query.order('published_at', { ascending: false, nullsFirst: false }).order('id').limit(40);
        if (error) throw new Error('Briefing could not be read.');
        const scope = school?.label || 'the campus network';
        if (!data.length) return privateJson({ reply: 'I found no ' + (pending ? 'pending' : 'approved, dated') + ' stories matching this request for ' + scope + '. Run a source scan or adjust the category.', citations: [] });
        const evidence = rankEditorialEvidence(message, data);
        const lines = evidence.rows.map((entry) => {
          const summary = updateSummary(entry.excerpt, entry.title, 165);
          return '• ' + entry.title + ' — ' + entry.source_label + (entry.published_at ? ' (' + entry.published_at.slice(0, 10) + ')' : ' (date unconfirmed)') + (summary ? '\n  ' + summary : '');
        });
        return privateJson({
          reply: (pending ? 'Private leads awaiting review' : 'Approved updates from the past 30 days') + ' · ' + scope
            + (evidence.matched ? '' : '\nNo exact topic match. Showing the most recent evidence in this selection.') + '\n\n' + lines.join('\n'),
          citations: evidence.rows.flatMap((entry) => {
            const url = publicSourceUrl(entry.canonical_url);
            return url ? [{ title: entry.title, url: url.href }] : [];
          }),
        });
      }
      const result = await askUniEcoAi({ messages: [{ role: 'user', content: message }] });
      return privateJson({ reply: result.text, citations: [] });
    } catch { return privateJson({ error: 'The assistant could not retrieve the requested evidence.' }, 503); }
  }
  if (action === 'draft' || action === 'queue_existing_broadcast') {
    // Preserve the separate, audited communications draft workflow. Never send
    // an email, push, or broadcast from the research workspace.
    let entry: { title: string; summary: string; url: string; label: string };
    let audience: 'all' | 'students' | 'vendors' = body.audience === 'students' || body.audience === 'vendors' ? body.audience : 'all';
    if (action === 'draft') {
      if (typeof body.itemId !== 'string' || !campusFeedUuid.test(body.itemId)) return privateJson({ error: 'Select a valid review item.' }, 400);
      const { data, error } = await db.from('campus_feed_items').select('title,excerpt,canonical_url,source_label,status').eq('id', body.itemId).maybeSingle();
      if (error) return privateJson({ error: 'Unable to load the update.' }, 503);
      if (!data || data.status === 'rejected') return privateJson({ error: 'This story cannot be used for a notification draft.' }, 409);
      entry = { title: data.title, summary: data.excerpt, url: data.canonical_url, label: data.source_label };
    } else {
      if (typeof body.broadcastId !== 'string' || !campusFeedUuid.test(body.broadcastId)) return privateJson({ error: 'Select a valid source-linked broadcast.' }, 400);
      const { data: broadcast, error } = await auth.supabase.from('admin_broadcasts')
        .select('title,body,broadcast_type,target_audience,target_filters,status').eq('id', body.broadcastId).maybeSingle();
      if (error) return privateJson({ error: 'Unable to load this broadcast.' }, 503);
      if (!broadcast || broadcast.broadcast_type !== 'update' || broadcast.status === 'cancelled') {
        return privateJson({ error: 'Only an active source-linked update can enter Campus Updates review.' }, 400);
      }
      const sourceUrl = broadcast.target_filters?.source_url;
      entry = { title: broadcast.title, summary: broadcast.body, url: typeof sourceUrl === 'string' ? sourceUrl : '', label: '' };
      audience = broadcast.target_audience === 'students' || broadcast.target_audience === 'vendors' ? broadcast.target_audience : 'all';
    }
    let source;
    try {
      const catalog = await loadResearchCatalog(db);
      source = catalog.find((candidate) => candidate.registered && candidate.state === 'ready' && candidate.website
        && sourceLink(entry.url, candidate.website, candidate.hosts));
    } catch { return privateJson({ error: 'Unable to verify this publisher.' }, 503); }
    const url = publicSourceUrl(entry.url);
    if (!source || !url || url.href.length > 650 || entry.title.trim().length < 8) {
      return privateJson({ error: 'This update does not match an enabled Campus Updates publisher.' }, 400);
    }
    const label = entry.label || source.label;
    const draft = await createUniEcoAiDraft({ update: { title: entry.title, summary: entry.summary, url: url.href, sourceLabel: label }, audience });
    const { data, error } = await auth.supabase.rpc('prepare_admin_ai_update', {
      p_title: entry.title.slice(0, 220), p_summary: entry.summary.slice(0, 500),
      p_source_url: url.href, p_source_label: label.slice(0, 160),
      p_broadcast_title: draft.title, p_broadcast_body: draft.body, p_target_audience: audience,
    });
    if (error) return privateJson({ error: 'The draft could not be prepared. No public post or additional broadcast was sent.' }, 503);
    return privateJson(data);
  }
  return privateJson({ error: 'Unsupported AI action.' }, 400);
}
