import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { testModules } from './helpers/load-typescript.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('newsroom search tokens cannot introduce a PostgREST operator and lead artwork is local and credited', () => {
  const { newsroomSearchTokens, newsroomCampusArt } = testModules()('lib/ai/newsroom.ts');
  assert.deepEqual(newsroomSearchTokens("Yamfo, (KNUST%')"), ['Yamfo', 'KNUST']);
  assert.deepEqual(newsroomSearchTokens('KNUST KNUST College'), ['KNUST', 'College']);
  assert.equal(newsroomCampusArt('acadEmic-city'), null);
  assert.equal(newsroomCampusArt('academic-city'), '/assets/homepage/academic-city-campus-1200.webp');
  assert.equal(newsroomCampusArt('__proto__'), null);
  const feed = read('components/feed/campus-updates.tsx');
  assert.match(feed, /Lead story/);
  assert.match(feed, /The Newswire/);
  assert.match(feed, /Campus file photo/);
  assert.match(feed, /query\.or\(/);
  assert.doesNotMatch(feed, /sticky top-/);
  assert.match(read('components/pwa/install-prompt.tsx'), /const isReadingUpdates = pathname === '\/updates' \|\| pathname.startsWith\('\/updates\/'\)/);
  assert.match(read('app/updates/page.tsx'), /headers: \{ apikey: key, Authorization: 'Bearer ' \+ key \}/);
});

test('campus updates produce a branded, source-attributed social flyer and story preview', () => {
  const flyer = read('lib/ai/flyer.tsx');
  const detail = read('app/updates/[id]/page.tsx');
  assert.match(flyer, /width: 1080, height: 1350/);
  assert.match(flyer, /updateSummary\(data\.excerpt, data\.title/);
  assert.match(flyer, /UniEco Ghana is an independent publisher/);
  assert.match(detail, /openGraph: \{ type: 'article'/);
  assert.match(detail, /api\/campus-feed\/alert-card\?id=/);
  assert.match(detail, /alternates: \{ canonical: url \}/);
});

test('the main share action sends JPEG files and never substitutes a story link', () => {
  const actions = read('components/feed/campus-update-actions.tsx');
  const feed = read('components/feed/campus-updates.tsx');
  assert.match(actions, /navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(actions, /navigator\.share\(\{ files: \[file\], title \}\)/);
  assert.doesNotMatch(actions, /navigator\.share\([^\n]*\burl\b/);
  assert.match(actions, /type: 'image\/jpeg'/);
  assert.match(actions, /navigator\.clipboard\.writeText/);
  assert.match(actions, /const filename = 'unieco-campus-update\.jpg'/);
  assert.match(actions, /download=\{filename\}/);
  assert.match(feed, /<CampusUpdateActions/);
  assert.match(feed, /<CampusUpdateActions id=\{item\.id\} title=\{item\.title\} compact shareOnly/);
});

test('public and management views cover the full university directory without claiming missing official sources', () => {
  const publicFeed = read('components/feed/campus-updates.tsx');
  const catalog = read('lib/ai/research-catalog.ts');
  const service = read('lib/ai/research-service.ts');
  const adminUi = read('app/admin/ai/page.tsx');
  assert.match(publicFeed, /from\('universities'\).*limit\(500\)/s);
  assert.match(publicFeed, /no-feed:/);
  assert.match(service, /\.range\(offset, offset \+ pageSize - 1\)/);
  assert.match(catalog, /'missing_source'/);
  assert.match(adminUi, /Schools \(' \+ schools\.length/);
  assert.match(read('lib/ai/bulletin.ts'), /\.from\('campus_feed_public_items'\)/);
});
