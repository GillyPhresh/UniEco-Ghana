import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const project = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(project, relative), 'utf8');
const migration = read('supabase/migrations/20261101170000_0174_moderated_campus_feed.sql');
const expansion = read('supabase/migrations/20261107100000_0185_expand_campus_feed_school_sources.sql');
const ingest = read('app/api/internal/campus-feed/ingest/route.ts');
const admin = read('app/api/admin/campus-feed/route.ts');
const publicPage = read('components/feed/campus-updates.tsx');
const review = read('app/admin/ai/campus-feed-review.tsx');

test('feed ingestion has a long secret, constant-time auth and bounded request', () => {
  assert.match(ingest, /UNIECO_FEED_INGEST_TOKEN/);
  assert.match(ingest, /timingSafeEqual/);
  assert.match(ingest, /maxBodyBytes/);
  assert.match(ingest, /source_id.*\[a-z0-9-\]/);
  assert.match(ingest, /export async function GET\(request: Request\)/);
  assert.match(ingest, /\.from\('campus_feed_sources'\)/);
  assert.match(ingest, /supabase\.rpc\('ingest_campus_feed_items'/);
  assert.doesNotMatch(ingest, /NEXT_PUBLIC_.*SERVICE_ROLE/);
  assert.match(expansion, /university\.is_enabled/);
  assert.match(expansion, /university\.website_url/);
  assert.match(expansion, /ON CONFLICT \(id\) DO NOTHING/);
});

test('database exposes only approved public fields and keeps review RPC super-admin-only', () => {
  assert.match(migration, /campus_feed_public_items[\s\S]*WHERE item\.status = 'approved' AND source\.enabled/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.campus_feed_items FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /get_campus_feed_review_items\(p_status text\)[\s\S]*public\.is_super_admin\(\)/);
  assert.match(migration, /moderate_campus_feed_item[\s\S]*public\.is_super_admin\(\)/);
  assert.match(migration, /WHERE public\.campus_feed_items\.status = 'pending'/);
});

test('admin feed review route verifies authenticated super-admin role and audit note', () => {
  assert.match(admin, /auth\.getUser\(\)/);
  assert.match(admin, /current_app_role/);
  assert.match(admin, /role !== 'super_admin'/);
  assert.match(admin, /moderate_campus_feed_item/);
  assert.match(admin, /maxReviewBodyBytes/);
});

test('public feed reads the approved-only view and preserves source attribution', () => {
  assert.match(publicPage, /campus_feed_public_items/);
  assert.doesNotMatch(publicPage, /from\('campus_feed_items'\)/);
  assert.doesNotMatch(publicPage, /\.order\('fetched_at'/);
  assert.match(publicPage, /\.order\('id'/);
  assert.match(publicPage, /canonical_url/);
  assert.match(publicPage, /rel="noopener noreferrer"/);
  assert.match(publicPage, /preload="none"/);
});

test('only private UniEco AI review control can approve; public feed does not auto-publish', () => {
  assert.match(review, /Campus feed review/);
  assert.match(review, /Approve for Campus Updates/);
  assert.match(review, /10–500 characters/);
  assert.match(read('components/layout/site-header.tsx'), /href: '\/updates'/);
  assert.match(read('app/admin/ai/page.tsx'), /<CampusFeedReview \/>/);
});

test('scheduled worker uses secrets only and invokes the bounded Python collector', () => {
  const workflow = fs.readFileSync(path.resolve(project, '..', '.github/workflows/campus-feed-ingest.yml'), 'utf8');
  assert.match(workflow, /refs\/heads\/deploy-main/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /secrets\.UNIECO_FEED_INGEST_TOKEN/);
  assert.match(workflow, /python feed_worker\/ingest\.py/);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
});
