import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

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

test('sharing uses native file share where available, with a link-copy and image-download fallback', () => {
  const actions = read('components/feed/campus-update-actions.tsx');
  const feed = read('components/feed/campus-updates.tsx');
  assert.match(actions, /navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(actions, /navigator\.share\(\{ title, text: message, url: pageUrl \}\)/);
  assert.match(actions, /navigator\.clipboard\.writeText/);
  assert.match(actions, /download="unieco-campus-update\.png"/);
  assert.match(feed, /<CampusUpdateActions/);
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
