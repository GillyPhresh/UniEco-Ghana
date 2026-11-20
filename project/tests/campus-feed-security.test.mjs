import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const project = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(project, relative), 'utf8');
const migration = read('supabase/migrations/20261101170000_0174_moderated_campus_feed.sql');
const expansion = read('supabase/migrations/20261107100000_0185_expand_campus_feed_school_sources.sql');
const opportunitySources = read('supabase/migrations/20261107120000_0186_official_opportunity_sources.sql');
const broaderSources = read('supabase/migrations/20261120100000_0214_general_news_and_scholarship_sources.sql');
const ingest = read('app/api/internal/campus-feed/ingest/route.ts');
const admin = read('app/api/admin/campus-feed/route.ts');
const publicPage = read('components/feed/campus-updates.tsx');
const review = read('app/admin/ai/campus-feed-review.tsx');
const alertCard = read('app/api/campus-feed/alert-card/route.tsx');

test('feed ingestion has a long secret, constant-time auth and bounded request', () => {
  assert.match(ingest, /UNIECO_FEED_INGEST_TOKEN/);
  assert.match(ingest, /timingSafeEqual/);
  assert.match(ingest, /maxBodyBytes/);
  assert.match(ingest, /source_id.*\[a-z0-9-\]/);
  assert.match(ingest, /export async function GET\(request: Request\)/);
  assert.match(ingest, /\.from\('campus_feed_sources'\)/);
  assert.match(ingest, /maxConfiguredSources = 250/);
  assert.equal((ingest.match(/\.limit\(maxConfiguredSources\)/g) || []).length, 2);
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
  assert.match(admin, /requireResearchAdmin\(\)/);
  assert.match(admin, /moderate_campus_feed_item/);
  assert.match(admin, /readJsonLimited\(request, 8 \* 1024\)/);
  assert.match(admin, /body\.reason\.trim\(\)\.length < 10/);
});

test('public feed reads the approved-only view and preserves source attribution', () => {
  assert.match(publicPage, /campus_feed_public_items/);
  assert.doesNotMatch(publicPage, /from\('campus_feed_items'\)/);
  assert.doesNotMatch(publicPage, /\.order\('fetched_at'/);
  assert.match(publicPage, /\.order\('id'/);
  assert.match(publicPage, /canonical_url/);
  assert.match(publicPage, /rel="noopener noreferrer"/);
  const media = read('components/feed/campus-update-media.tsx');
  assert.match(read('app/updates/[id]/page.tsx'), /<CampusUpdateMedia/);
  assert.match(media, /publisherHost\(source\.hostname\) !== publisherHost\(media\.hostname\)/);
  assert.doesNotMatch(media, /<iframe|<video|<img/);
});

test('editorial review is private; the public feed cannot change approval state', () => {
  assert.match(review, /Campus feed review/);
  assert.match(review, /Publish update/);
  assert.match(review, /Unpublish/);
  assert.doesNotMatch(publicPage, /\.insert\(|\.update\(|\.upsert\(|\.rpc\(/);
  assert.match(review, /minLength=\{10\} maxLength=\{500\}/);
  assert.match(read('components/layout/site-header.tsx'), /href: '\/updates'/);
  assert.match(read('app/admin/ai/page.tsx'), /<CampusFeedReview sources=/);
});

test('official opportunity sources stay moderated and use a narrow public source directory', () => {
  assert.match(opportunitySources, /source_kind IN \('campus', 'opportunities'\)/);
  assert.match(opportunitySources, /scholarships\.gov\.gh/);
  assert.match(opportunitySources, /neip\.gov\.gh/);
  assert.match(opportunitySources, /campus_feed_public_sources/);
  assert.match(publicPage, /campus_feed_public_sources/);
  assert.match(publicPage, /Confirm eligibility, deadlines/);
  assert.match(read('feed_worker/ingest.py'), /parse_official_opportunities/);
  assert.match(read('feed_worker/ingest.py'), /Confirm current eligibility/);
});

test('trusted Ghanaian and international publishers are source-allowlisted without bypassing review', () => {
  assert.match(broaderSources, /source_kind IN \('campus', 'opportunities', 'news'\)/);
  for (const id of ['ghana-news-agency', 'myjoyonline', '3news', 'associated-press', 'cambridge-press', 'bank-of-ghana',
    'getfund-local-scholarships', 'ug-scholarships', 'knust-scholarships', 'commonwealth-shared-scholarships', 'manchester-scholarships', 'oxford-reach-scholarship']) {
    assert.ok(broaderSources.includes(`('${id}'`), `migration registers ${id}`);
  }
  assert.match(broaderSources, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(broaderSources, /security_invoker\s*=\s*true[\s\S]*security_barrier\s*=\s*true/);
  assert.doesNotMatch(broaderSources, /INSERT INTO public\.campus_feed_items|status\s*=\s*'approved'/i);
  assert.match(read('lib/ai/research-service.ts'), /sourceKind: source\.registration\?\.source_kind/);
  assert.match(publicPage, /News publishers/);
  assert.match(publicPage, /Scholarships and national opportunities/);
  assert.match(read('app/admin/ai/page.tsx'), /Leads remain private until an administrator checks and publishes them/);
});

test('branded alert image can only render a public approved feed item', () => {
  assert.match(alertCard, /campus_feed_public_items/);
  assert.match(alertCard, /renderUpdateFlyer/);
  const renderer = read('lib/ai/flyer.tsx');
  assert.match(renderer, /ImageResponse/);
  assert.match(renderer, /unieco-flyer-mark\.png/);
  assert.match(renderer, /'Content-Disposition'/);
});

test('public item queries stay within the current view and derive source kind from its safe source projection', () => {
  assert.doesNotMatch(read('lib/ai/newsroom.ts'), /newsroomFields\s*=\s*['"][^'"]*source_kind/);
  assert.match(alertCard, /campus_feed_public_sources/);
  assert.match(alertCard, /source_kind/);
  assert.match(read('components/feed/campus-updates.tsx'), /sourceKinds\.current/);
});

test('manual worker uses secrets only and production runs without GitHub scheduling', () => {
  const workflow = fs.readFileSync(path.resolve(project, '..', '.github/workflows/campus-feed-ingest.yml'), 'utf8');
  assert.match(workflow, /refs\/heads\/deploy-main/);
  assert.match(workflow, /environment: "UniEco Ghana - Production \/ production"/);
  assert.match(workflow, /secrets\.UNIECO_FEED_INGEST_TOKEN/);
  assert.match(workflow, /python feed_worker\/run_research\.py/);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
  const launcher = read('scripts/run-railway.mjs');
  assert.match(launcher, /environment === 'production'/);
  assert.match(launcher, /scheduleCampusResearch\(port, researchNonce\)/);
});
