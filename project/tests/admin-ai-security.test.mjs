import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { testModules } from './helpers/load-typescript.mjs';

const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const route = read('app/api/admin/ai/route.ts');
const page = read('app/admin/ai/page.tsx');
const worker = read('app/api/internal/campus-feed/research/route.ts');

test('UniEco AI rejects anonymous and non-super-admin requests before looking up any source', async () => {
  let user = null;
  let role = 'student';
  const use = testModules({
    '@/lib/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
      rpc: async (name) => { assert.equal(name, 'current_app_role'); return { data: role }; },
    }) },
  });
  const { requireResearchAdmin, acceptsAdminMutation } = use('lib/ai/admin-access.ts');
  assert.equal((await requireResearchAdmin()).error.status, 401);
  user = { id: 'student-id' };
  assert.equal((await requireResearchAdmin()).error.status, 403);
  role = 'super_admin';
  assert.equal((await requireResearchAdmin()).ok, true);
  const request = (origin, fetchSite) => new Request('https://www.uniecoghana.com/api/admin/ai', {
    method: 'POST', headers: { origin, 'sec-fetch-site': fetchSite, 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(acceptsAdminMutation(request('https://evil.com', 'cross-site')), false);
  assert.equal(acceptsAdminMutation(request('https://www.uniecoghana.com', 'same-origin')), true);
  assert.match(route, /requireResearchAdmin\(\)/);
  assert.match(route, /acceptsAdminMutation\(request\)/);
  assert.match(route, /verifyResearchLead\(body\.proof, auth\.userId\)/);
  assert.doesNotMatch(route, /fetchPublisher\(|body\.url|body\.media_url/);
});

test('research queues separate, source-linked work and never approves or sends', () => {
  assert.match(page, /AdminRouteGuard/);
  assert.match(page, /Queue for review/);
  assert.match(page, /Campus feed review/);
  assert.match(route, /queueResearchLeads/);
  assert.match(route, /rpc\('prepare_admin_ai_update'/);
  assert.match(route, /action === 'queue_existing_broadcast'/);
  assert.match(route, /broadcast\.broadcast_type !== 'update'/);
  assert.match(route, /broadcast\.status === 'cancelled'/);
  assert.match(route, /Only an active source-linked update/);
  assert.doesNotMatch(route + worker, /moderate_campus_feed_item|begin_admin_broadcast_delivery/);
  const broadcasts = read('app/admin/broadcasts/page.tsx');
  assert.match(broadcasts, /Queue public review/);
  assert.match(broadcasts, /action: 'queue_existing_broadcast'/);
  assert.match(broadcasts, /Recipients queued:/);
});

test('manual and automatic worker credentials are distinct; only reviews can publish', async () => {
  assert.match(worker, /timingSafeEqual/);
  assert.match(worker, /UNIECO_FEED_INGEST_TOKEN/);
  assert.match(worker, /UNIECO_RESEARCH_SCHEDULER_NONCE/);
  assert.match(worker, /caller === 'scheduler'/);
  assert.match(worker, /if \(!dryRun/);
  assert.match(worker, /campus_research\.sweep_started/);
  const review = read('app/api/admin/campus-feed/route.ts');
  assert.match(review, /body\.sourceConfirmed !== true/);
  assert.match(review, /item\.updated_at !== body\.reviewedVersion/);
  assert.match(review, /auth\.supabase\.rpc\('moderate_campus_feed_item'/);
});

test('editorial assistant answers from selected evidence without a metered provider', () => {
  const assistant = read('lib/ai/assistant.ts');
  assert.match(route, /mode: 'provider-free'/);
  assert.match(route, /providerFree: true/);
  assert.match(route, /campus_feed_public_items/);
  assert.match(route, /get_admin_system_health_summary/);
  assert.doesNotMatch(route + assistant, /api\.openai\.com|chat\/completions/);
  assert.match(page, /No paid AI service is contacted/);
  assert.match(page, /Check assistant/);
});
