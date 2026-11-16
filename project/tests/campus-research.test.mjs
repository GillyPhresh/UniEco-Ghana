import test from 'node:test';
import assert from 'node:assert/strict';
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
  const totals = await sweepCampusResearch({ port: 3000, token: 'fixture-token', fetchBatch: async (url, options) => {
    assert.equal(new URL(url).hostname, '127.0.0.1');
    assert.equal(options.redirect, 'error');
    const { offset } = JSON.parse(options.body);
    const row = { state: 'found', found: 1, added: 0, error: false };
    const end = Math.min(offset + 8, 209);
    return Response.json({ report: Array.from({ length: end - offset }, () => row), nextOffset: end === 209 ? null : end });
  } });
  assert.equal(totals.processed, 209);
  assert.equal(totals.found, 209);
});
