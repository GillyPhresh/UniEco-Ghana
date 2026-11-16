import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { testModules } from './helpers/load-typescript.mjs';
import { sweepCampusResearch } from '../scripts/run-campus-research-schedule.mjs';

const use = testModules({ './flyer': {} });
const { publicSourceUrl, sourceLink, officialPublisherUrl } = use('lib/ai/public-source-url.ts');
const { choosePublicAddress, isPublicAddress } = use('lib/ai/publisher-fetch.ts');
const { parsePublisherPolicy, allowsPublisherPath } = use('lib/ai/publisher-policy.ts');
const { buildResearchCatalog, schoolSourceId } = use('lib/ai/research-catalog.ts');
const { parsePublisherIndex, parsePublisherArticle } = use('lib/ai/research.ts');
const { issueResearchLead, verifyResearchLead, leadMatchesSource, queueResearchLeads } = use('lib/ai/research-service.ts');
const { getCuratedCampusProfile } = use('lib/data/university-branding.ts');
const now = Date.parse('2026-11-16T10:00:00Z');
const site = 'https://www.cohy.edu.gh/';
const school = (slug, i, extras = {}) => ({
  id: (1000 + i).toString(16).padStart(8, '0') + '-c000-4000-a000-aaaaaaaaaaaa',
  slug, name: slug, official_name: null, short_name: null, website_url: null,
  ...extras,
});
const yamfo = school('college-of-health-yamfo', 1, {
  name: 'College of Health, Yamfo',
  curatedWebsite: getCuratedCampusProfile('college-of-health-yamfo').website,
  curatedNews: getCuratedCampusProfile('college-of-health-yamfo').news,
});
const [publisher] = buildResearchCatalog([yamfo], []);
const headline = 'College holds its student research forum';
const story = site + 'news/student-research-forum';

test('only approved HTTPS publisher hosts can be attempted; mixed public/private DNS fails closed', () => {
  for (const url of ['http://cohy.edu.gh', 'https://localhost/x', 'https://127.1/x', 'https://2130706433',
    'https://[::ffff:127.0.0.1]', 'https://cohy.edu.gh:444/x', 'https://x:y@cohy.edu.gh', 'https://cohy.edu.gh\\@evil.net']) {
    assert.equal(publicSourceUrl(url), null, url);
  }
  assert.equal(officialPublisherUrl('https://facebook.com/a-school'), null);
  assert.equal(sourceLink('https://cohy.edu.gh.evil.com/news', site, publisher.hosts), null);
  assert.equal(sourceLink('https://portal.cohy.edu.gh/news', site, publisher.hosts), null);
  assert.equal(sourceLink('https://cohy.edu.gh/news', site, publisher.hosts).hostname, 'cohy.edu.gh');
  for (const ip of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254', '192.168.0.1', '100.64.1.1',
    '192.0.2.1', '224.0.0.1', 'fd00::2', 'fe80::1', '::ffff:10.0.0.1', '2001:db8::2', '64:ff9b::7f00:1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  assert.equal(isPublicAddress('1.1.1.1'), true);
  assert.throws(() => choosePublicAddress([{ family: 4, address: '1.1.1.1' }, { family: 4, address: '10.0.0.9' }]));
});

test('the transport uses the validated socket IP with verified publisher TLS and re-checks redirects', async () => {
  const attempts = [];
  const load = testModules({
    'node:dns/promises': { lookup: async () => [{ family: 4, address: '8.8.4.4' }] },
    'node:https': { request: (options, next) => {
      attempts.push(options);
      return { once() {}, end() {
        next({ statusCode: 302, headers: { location: 'https://cohy.edu.gh.evil.com/news' }, destroy() {} });
      } };
    } },
  });
  await assert.rejects(load('lib/ai/publisher-fetch.ts').fetchPublisher(story, publisher.hosts, { mimeTypes: ['text/html'], maxBytes: 50 }));
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].hostname, '8.8.4.4');
  assert.equal(attempts[0].servername, 'www.cohy.edu.gh');
  assert.equal(attempts[0].headers.Host, 'www.cohy.edu.gh');
  assert.equal(attempts[0].rejectUnauthorized, true);
});

test('publisher crawl rules take specificity into account and permit no forbidden rediscovery', () => {
  const policy = parsePublisherPolicy('User-agent: *\nDisallow: /private*\nAllow: /private/news$\nDisallow: /checkout');
  assert.equal(allowsPublisherPath(policy, new URL(site + 'private/news')), true);
  assert.equal(allowsPublisherPath(policy, new URL(site + 'private/news?q=1')), false);
  assert.equal(allowsPublisherPath(policy, new URL(site + '%70rivate/test')), false);
  assert.equal(allowsPublisherPath(policy, new URL(story)), true);
  assert.equal(parsePublisherPolicy('User-agent: *\nCrawl-delay: 10').blocked, true);
});

test('catalog retains all 207 profiles and adopts existing publisher IDs without silently reopening them', () => {
  const profiles = [yamfo, ...Array.from({ length: 206 }, (_, i) => school('school-' + i, i + 2))];
  let configured = buildResearchCatalog(profiles, []);
  assert.equal(configured.length, 207);
  assert.equal(configured.at(-1).schoolSlug, 'school-205');
  assert.equal(configured.at(-1).state, 'missing_source');
  assert.deepEqual(configured[0].seeds, [site + 'news/', site]);
  assert.equal(configured[0].registration.id, schoolSourceId(yamfo.id));
  configured = buildResearchCatalog(profiles, [{ ...configured[0].registration, id: 'yamfo-legacy', enabled: false }]);
  assert.equal(configured[0].state, 'paused');
  assert.equal(configured[0].registration.id, 'yamfo-legacy');
  assert.deepEqual(configured[0].seeds, []);
  const crossSchool = buildResearchCatalog([yamfo, school('similar-school', 2, { curatedWebsite: site })], []);
  assert.deepEqual(crossSchool.map((entry) => entry.state), ['shared_source', 'shared_source']);
});

test('HTML research requires a supporting article link and extracts the article’s own date and media', () => {
  const index = parsePublisherIndex(`<!DOCTYPE html><head>
    <link type="application/rss+xml" rel="alternate" href="/feed/"></head><body>
    <nav><a href="/news/">News</a></nav>
    <h2><a href="/news/student-research-forum?utm_source=tracking">${headline}</a></h2>
    <a href="/account/reset">News and updates about student portal</a>
    <a href="https://untrusted.com/news/research">Campus event announcement</a></body>`, site, publisher, now);
  assert.deepEqual(index.candidates.map((lead) => lead.url), [story]);
  assert.deepEqual(index.indexes, [site + 'feed/', site + 'news/']);
  const lead = parsePublisherArticle(`<html><head>
    <meta name="description" content="Students and tutors shared new research findings at a practical campus session for the college community.">
    <meta property="article:published_time" content="2026-11-12T12:00:00Z">
    <meta property="og:image" content="/media/forum.webp">
    <link rel="canonical" href="https://evil.com/news/incorrect">
    </head><main><article><h1>${headline}</h1><p>Campus information.</p></article></main></html>`,
    story, publisher, index.candidates[0], now);
  assert.equal(lead.canonical_url, story);
  assert.equal(lead.published_at, '2026-11-12T12:00:00.000Z');
  assert.equal(lead.media_url, site + 'media/forum.webp');
  assert.equal(lead.category, 'research');
  assert.ok(leadMatchesSource(publisher, lead));
  assert.equal(parsePublisherArticle('<meta name="robots" content="nosnippet">', story, publisher, index.candidates[0], now), null);
});

test('XML rejects entity declarations and video embeds are cited at the original article', () => {
  assert.equal(parsePublisherIndex('<!DOCTYPE rss [<!ENTITY user SYSTEM "file:///etc/passwd">]><rss/>',
    site, publisher, now).readable, false);
  const index = parsePublisherIndex(`<?xml version="1.0"?><rss><channel><item><title>${headline}</title>
    <link>${story}</link><pubDate>Fri, 13 Nov 2026 12:00:00 GMT</pubDate>
    <description><![CDATA[<p>Students developed a community-health demonstration.</p>]]></description>
    <enclosure url="${site}media/session.mp4" type="video/mp4"/></item></channel></rss>`, site, publisher, now);
  assert.equal(index.candidates[0].date, '2026-11-13T12:00:00.000Z');
  assert.equal(index.candidates[0].media.type, 'video');
  const record = parsePublisherArticle(`<main><article><h1>${headline}</h1>
    <iframe src="https://www.youtube-nocookie.com/embed/abcdefghijk"></iframe></article></main>`,
    story, publisher, { ...index.candidates[0], media: undefined }, now);
  assert.equal(record.media_url, story);
  assert.equal(record.media_type, 'video');
});

test('research proofs are short-lived, bound to the admin, and cannot be tampered with', () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-unit-test-not-a-real-supabase-credential';
  try {
    const lead = { title: headline, canonical_url: story };
    const signed = issueResearchLead(publisher, lead, 'admin-1', now);
    assert.equal(verifyResearchLead(signed, 'admin-1', now).lead.title, headline);
    assert.equal(verifyResearchLead(signed, 'admin-2', now), null);
    assert.equal(verifyResearchLead(signed, 'admin-1', now + 31 * 60_000), null);
    assert.equal(verifyResearchLead('x' + signed, 'admin-1', now), null);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test('queuing a lead skips duplicates and cannot alter a reviewed record', async () => {
  const writes = [];
  const db = { from(table) {
    return {
      upsert(rows, options) {
        writes.push({ table, rows, options });
        return table === 'campus_feed_sources' ? {} : { select: async () => ({ data: [{ id: 'item' }] }) };
      },
      select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: publisher.registration }),
        in: async () => ({ data: [{ canonical_url: site + 'news/already-approved' }] }),
      }) }),
    };
  } };
  const lead = (canonical_url) => ({ title: headline, excerpt: '', source_id: publisher.registration.id,
    source_item_key: 'b'.repeat(64), canonical_url, category: 'news', media_url: null, media_type: null, published_at: null });
  assert.deepEqual(await queueResearchLeads(db, publisher, [lead(story), lead(site + 'news/already-approved'), lead('https://evil.com')]), { added: 1, existing: 1 });
  assert.equal(writes.length, 2);
  assert.equal(writes[1].rows[0].status, 'pending');
  assert.equal(writes[1].options.ignoreDuplicates, true);
  assert.equal(writes[1].rows.length, 1);
});

test('the production sweep iterates every school and national source through a loopback-only API', async () => {
  const windows = new Set();
  const totals = await sweepCampusResearch({ port: 3000, token: 'fixture-token', fetchBatch: async (url, options) => {
    assert.equal(new URL(url).hostname, '127.0.0.1');
    assert.equal(options.redirect, 'error');
    const { offset, windowUtc } = JSON.parse(options.body);
    windows.add(windowUtc);
    const row = { state: 'found', found: 1, added: 0, error: false };
    const end = Math.min(offset + 8, 209);
    return Response.json({ report: Array.from({ length: end - offset }, () => row), nextOffset: end === 209 ? null : end });
  } });
  assert.equal(totals.processed, 209);
  assert.equal(totals.found, 209);
  assert.equal(windows.size, 1);
});

test('transient errors replay only the interrupted batch without losing full-directory progress', async () => {
  const offsets = [];
  const pauses = [];
  const row = { state: 'found', found: 1, added: 1, error: false };
  const totals = await sweepCampusResearch({ port: 3000, token: 'fixture-token',
    delay: async (ms) => { pauses.push(ms); },
    fetchBatch: async (_, options) => {
      const { offset } = JSON.parse(options.body);
      offsets.push(offset);
      assert.equal(options.headers.Connection, 'close');
      if (offset === 0) return Response.json({ report: Array.from({ length: 8 }, () => row), nextOffset: 8 });
      if (offsets.length === 2) return new Response(null, { status: 503 });
      if (offsets.length === 3) throw new DOMException('Interrupted by timeout.', 'TimeoutError');
      return Response.json({ report: [row], nextOffset: null });
    },
  });
  assert.deepEqual(offsets, [0, 8, 8, 8]);
  assert.deepEqual(pauses, [1_200, 3_000]);
  assert.deepEqual(totals, { processed: 9, found: 9, added: 9, gap: 0, failures: 0 });
});

test('sweeps fail closed on authentication or an invalid cursor', async () => {
  let attempts = 0;
  await assert.rejects(sweepCampusResearch({ port: 3000, token: 'fixture-token',
    fetchBatch: async () => { attempts++; return new Response(null, { status: 401 }); },
  }), /offset 0.*HTTP 401/);
  assert.equal(attempts, 1);
  await assert.rejects(sweepCampusResearch({ port: 3000, token: 'fixture-token',
    fetchBatch: async () => Response.json({ report: [{ state: 'missing_source', added: 0, found: 0 }], nextOffset: 8 }),
  }), /Invalid campus research cursor/);
});

test('an active sweep may not be replaced; one expired claim can recover and finish without rewriting history', async () => {
  const clock = Date.now();
  const windowUtc = new Date(Math.floor(clock / (6 * 3_600_000)) * 6 * 3_600_000).toISOString();
  const marker = (suffix) => {
    const hash = createHash('sha256').update('unieco:campus-research:v1:' + windowUtc + ':' + suffix).digest('hex');
    return hash.slice(0, 8) + '-' + hash.slice(8, 12) + '-5' + hash.slice(13, 16) + '-8' + hash.slice(17, 20) + '-' + hash.slice(20, 32);
  };
  const original = { id: marker('started'), metadata: { run_id: randomUUID() }, created_at: new Date(clock).toISOString() };
  const events = new Map([[original.id, original]]);
  const insert = async (row) => {
    if (events.has(row.id)) return { error: { code: '23505' } };
    events.set(row.id, { ...row, created_at: new Date().toISOString() });
    return {};
  };
  const db = { from(table) {
    assert.equal(table, 'audit_logs');
    return {
      insert, upsert: (row) => events.has(row.id) ? {} : insert(row),
      select: () => ({ eq: (_, id) => ({ maybeSingle: async () => ({ data: events.get(id) || null }) }) }),
    };
  } };
  const use = testModules({
    '@/lib/ai/admin-access': { privateJson: (value, status = 200) => Response.json(value, { status }) },
    '@/lib/ai/research-service': {
      createResearchClient: () => db, acquireResearchSlot: () => () => undefined,
      loadResearchCatalog: async () => [publisher],
      scanResearchBatch: async () => ({ outcomes: [{ source: publisher, state: 'no_updates', leads: [] }], nextOffset: null, total: 1 }),
      queueResearchLeads: () => assert.fail('No lead should be inserted.'),
    },
  });
  const { POST } = use('app/api/internal/campus-feed/research/route.ts');
  const token = 'local-scheduler-test-nonce-only-not-a-real-secret';
  const originalEnv = [process.env.UNIECO_ENV, process.env.UNIECO_RESEARCH_SCHEDULER_NONCE];
  process.env.UNIECO_ENV = 'production';
  process.env.UNIECO_RESEARCH_SCHEDULER_NONCE = token;
  const request = (runId) => new Request('http://127.0.0.1/api/internal/campus-feed/research', {
    method: 'POST', body: JSON.stringify({ offset: 0, runId, windowUtc }),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  try {
    const skip = await (await POST(request(randomUUID()))).json();
    assert.equal(skip.skipped, true);
    assert.ok(skip.retryAfterMs > 0);
    assert.equal(events.size, 1);
    original.created_at = new Date(clock - 26 * 60_000).toISOString();
    const recoveredRun = randomUUID();
    const recovered = await (await POST(request(recoveredRun))).json();
    assert.equal(recovered.total, 1);
    assert.equal(events.get(marker('recovery')).metadata.run_id, recoveredRun);
    assert.equal(events.get(marker('completed')).metadata.source_records, 1);
    assert.equal(events.get(marker('started')).metadata.run_id, original.metadata.run_id);
    assert.deepEqual(await (await POST(request(randomUUID()))).json(), { skipped: true });
    assert.equal(events.size, 3);
  } finally {
    for (const [index, key] of ['UNIECO_ENV', 'UNIECO_RESEARCH_SCHEDULER_NONCE'].entries()) {
      if (originalEnv[index] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[index];
    }
  }
});
