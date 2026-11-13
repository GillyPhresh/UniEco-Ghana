import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('campus discovery is bounded to HTTPS pages on each institution official host', async () => {
  const source = await read('../lib/campus-discovery.ts');
  assert.match(source, /safeOfficialWebsite\(university\.website_url\)/);
  assert.match(source, /redirect:\s*'manual'/);
  assert.match(source, /MAX_HTML_BYTES\s*=\s*650_000/);
  assert.match(source, /MAX_PAGES_PER_SCAN\s*=\s*5/);
  assert.match(source, /url\.hostname\.toLowerCase\(\)\s*!==\s*root\.hostname\.toLowerCase\(\)/);
  assert.match(source, /Schema\.org events\/local businesses/);
});

test('discovered leads require review and public reads expose published, unexpired records only', async () => {
  const migration = await read('../supabase/migrations/20261113100000_0197_campus_discovery_listings.sql');
  const route = await read('../app/api/admin/campus-discovery/route.ts');
  assert.match(migration, /DEFAULT 'pending_review'/);
  assert.match(migration, /status = 'published' AND expires_at > now\(\)/);
  assert.match(migration, /current_app_role\(\) = 'super_admin'/);
  assert.match(route, /role !== 'super_admin'/);
  assert.match(route, /Nothing was published/);
  assert.match(route, /\.eq\('status', 'pending_review'\)/);
});

test('admin can scan every configured official school source without publishing leads automatically', async () => {
  const page = await read('../app/admin/campus-discovery/page.tsx');
  assert.match(page, /async function scanAllConfiguredSites\(\)/);
  assert.match(page, /schools\.filter\(\(school\) => Boolean\(school\.website_url\)\)/);
  assert.match(page, /Scan all sites/);
  assert.match(page, /Nothing was published automatically/);
});

test('public campus pages label external discoveries separately from verified vendors', async () => {
  const page = await read('../app/university/[slug]/page.tsx');
  assert.match(page, /getPublishedCampusDiscoveries/);
  assert.match(page, /source_url/);
  assert.match(page, /not verified by UniEco/i);
});

test('school profiles offer live, non-persisted nearby search with OpenStreetMap attribution', async () => {
  const page = await read('../app/university/[slug]/page.tsx');
  const component = await read('../components/universities/campus-nearby-discovery.tsx');
  assert.match(page, /CampusNearbyDiscovery/);
  assert.match(component, /\/api\/maps\/open-places\/search/);
  assert.match(component, /OpenStreetMap contributors/);
  assert.match(component, /not copied into UniEco listings/);
  assert.match(component, /not UniEco-verified vendors/);
});
