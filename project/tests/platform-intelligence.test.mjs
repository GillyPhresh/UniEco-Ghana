import assert from 'node:assert/strict';
import test from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const load = testModules();
const { parseRecommendationQuery, selectRecommendations, cleanSignals, cleanQueueCounts, cleanSearchCounts, rankIntelligence } =
  load('lib/intelligence/model.ts');
const now = Date.parse('2026-11-18T12:00:00Z');
const story = (id, source, date = now, category = 'events') => ({
  id: 'b0000000-0000-4000-8000-' + String(id).padStart(12, '0'),
  source_id: source, source_label: source, category, title: 'Approved test headline ' + id,
  published_at: new Date(date).toISOString(), internal: 'must not leave the server',
});

test('recommendations accept only explicit supported topics and safe source IDs', () => {
  assert.deepEqual(parseRecommendationQuery(new URLSearchParams('topic=events&source=uew')), { topic: 'events', source: 'uew' });
  for (const input of ['topic=admin', 'topic=events&topic=notices', 'topic=events&source=evil%2Eexample',
    'topic=events&source=uew&source=knust', 'topic=events&source=%27x', '']) {
    assert.equal(parseRecommendationQuery(new URLSearchParams(input)), null);
  }
});

test('reader selection is recent, deduplicated and source-diverse, with no private fields', () => {
  const rows = [story(1, 'school-a'), story(2, 'school-a'), story(3, 'school-a'), story(1, 'school-a'),
    story(4, 'school-b', now - 500), story(5, 'school-b', now + 10_000), story(6, 'school-b', now - 31 * 86_400_000),
    story(7, 'school-b', now, 'research')];
  const selected = selectRecommendations(rows, now, 'events', null);
  assert.deepEqual(selected.map(row => row.id.slice(-1)), ['1', '2', '4']);
  assert.deepEqual(Object.keys(selected[0]).sort(), ['id', 'publishedAt', 'sourceLabel', 'title']);
  assert.deepEqual(selectRecommendations(rows, now, 'events', 'school-a').map(row => row.id.slice(-1)), ['1', '2', '3']);
});

test('public recommendations use a bounded anonymous query and report outages separately from empty results', async () => {
  const calls = [];
  let fail = false;
  const builder = {
    abortSignal: async signal => {
      assert.ok(signal instanceof AbortSignal);
      return fail ? { error: { message: 'private upstream error' } }
        : { data: [story(1, 'uew', Date.now() - 5000)] };
    },
  };
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit']) {
    builder[method] = (...args) => { calls.push([method, ...args]); return builder; };
  }
  const route = testModules({
    '@supabase/supabase-js': { createClient: (url, key, options) => {
      assert.equal(url, 'https://fixture.supabase.co');
      assert.equal(key, 'anonymous-read');
      assert.equal(options.auth.persistSession, false);
      assert.equal(options.global, undefined);
      return { from: table => {
        assert.equal(table, 'campus_feed_public_items');
        return builder;
      } };
    } },
    '@/lib/supabase/config': { getSupabaseConfig: () => ({ url: 'https://fixture.supabase.co', anonKey: 'anonymous-read' }) },
  })('app/api/intelligence/recommendations/route.ts');
  const request = params => new Request('https://www.uniecoghana.com/api/intelligence/recommendations?' + params,
    { headers: { Cookie: 'ignored=test' } });
  assert.equal((await route.GET(request('topic=bad'))).status, 400);
  assert.deepEqual(calls, []);
  const response = await route.GET(request('topic=events&source=uew'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=30');
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'source_id' && call[2] === 'uew'));
  assert.deepEqual(calls.at(-1), ['limit', 6]);
  const { items } = await response.json();
  assert.equal(items.length, 1);
  assert.equal(items[0].internal, undefined);

  fail = true;
  const failed = await route.GET(request('topic=events'));
  assert.deepEqual(calls.at(-1), ['limit', 36]);
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await failed.text(), /private upstream error/);
});

test('intelligence distinguishes missing and withheld data from measured zeroes', () => {
  assert.deepEqual(cleanSignals(null), { campuses: null, security: null });
  assert.deepEqual(cleanSearchCounts([]), { total: 0, noMatch: 0 });
  assert.equal(cleanSearchCounts([{ searches: 2, no_result_searches: 3 }]), null);
  assert.equal(cleanQueueCounts({ communicationQueue: { exhausted: 1, stuckProcessing: 'secret', agedQueued: 3 } }), null);
  const result = cleanSignals({ security: { recordedEvents: 0, paymentsNeedingReview: 0, actorId: 'private' },
    campuses: [{ slug: 'uew', name: 'UEW', searchDays: 8, noMatchDays: null, actorId: 'private' }] });
  assert.equal(result.campuses[0].noMatchDays, null);
  assert.doesNotMatch(JSON.stringify(result), /actorId|private/);
});

test('recommendations put operational review first and do not invent demand from thin data', () => {
  const snapshot = {
    checkedAt: new Date(now).toISOString(), days: 7,
    operations: { exhausted: 3, stuck: 2, aged: 0 }, security: { recordedEvents: 1, paymentsNeedingReview: 1 },
    campuses: [{ slug: 'abc', name: 'ABC', searchDays: 11, noMatchDays: 6 },
      { slug: 'def', name: 'DEF', searchDays: 99, noMatchDays: null }],
    searches: { total: 3, noMatch: 3 }, content: [{ topic: 'events', approved: 0 }],
  };
  assert.deepEqual(rankIntelligence(snapshot).map(item => item.id),
    ['queue', 'payment-review', 'security-events', 'campus-gap', 'editorial-supply']);
  assert.match(rankIntelligence(snapshot).at(-1).detail, /supply gap, not evidence of reader demand/);
  assert.deepEqual(rankIntelligence({ ...snapshot, campuses: null, operations: null, security: null, searches: null, content: null }), []);
});

test('admin route verifies access before touching data and shows unavailable cohorts without the migration', async () => {
  let mode = 'deny';
  const names = [];
  const auth = {
    privateJson: (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } }),
    requireResearchAdmin: async () => mode === 'deny'
      ? { ok: false, error: Response.json({}, { status: 403 }) }
      : { ok: true, supabase: {
        rpc(name) {
          names.push(name);
          const payload = name === 'get_admin_search_quality_metrics' ? [{ searches: 25, no_result_searches: 10 }]
            : { communicationQueue: { exhausted: 0, stuckProcessing: 0, agedQueued: 0 } };
          return { abortSignal: async () => name === 'get_admin_platform_intelligence' ? { data: null, error: { code: 'PGRST202' } } : { data: payload } };
        },
        from(table) {
          assert.equal(table, 'campus_feed_public_items');
          const chain = { select: () => chain, eq: () => chain, gte: () => chain, lte: () => chain, abortSignal: async () => ({ count: 4 }) };
          return chain;
        },
      } },
  };
  const route = testModules({ '@/lib/ai/admin-access': auth })('app/api/admin/intelligence/route.ts');
  const req = days => new Request('https://www.uniecoghana.com/api/admin/intelligence?days=' + days);
  assert.equal((await route.GET(req('7'))).status, 403);
  assert.deepEqual(names, []);
  mode = 'allow';
  assert.equal((await route.GET(req('365'))).status, 400);
  assert.deepEqual(names, []);
  const res = await route.GET(req('7'));
  assert.match(res.headers.get('cache-control'), /private, no-store/);
  const data = await res.json();
  assert.equal(data.campuses, null);
  assert.equal(data.security, null);
  assert.deepEqual(data.suggestions.map(value => value.id), ['search-gap']);
});
