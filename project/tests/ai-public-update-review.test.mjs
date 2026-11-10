import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20261110100000_0195_ai_update_public_feed_review.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');

test('AI source leads prepare public-feed and broadcast drafts transactionally', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.prepare_admin_ai_update/);
  assert.match(migration, /INSERT INTO public\.campus_feed_items/);
  assert.match(migration, /public\.create_admin_broadcast_draft\(/);
  assert.match(migration, /'pending'/);
  assert.match(migration, /'pending_approval'/);
  assert.match(migration, /ON CONFLICT \(source_id, source_item_key\) DO NOTHING/);
  assert.match(migration, /status <> 'cancelled'/);
  assert.match(migration, /public\.record_trusted_admin_action\(/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.prepare_admin_ai_update[\s\S]*TO authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.prepare_admin_ai_update[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
});

test('only enabled official feed domains can enter the public review queue', () => {
  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_super_admin\(\)/);
  assert.match(migration, /source\.enabled/);
  assert.match(migration, /source_host = lower\(source\.source_domain\)/);
  assert.match(migration, /This trusted site is not enabled for the public Campus Updates feed/);
  assert.match(migration, /feed_item_status = 'rejected'/);
  assert.match(migration, /Never resurrect a story/);
});

test('AI endpoint uses the atomic review pipeline and the admin UI explains both approvals', () => {
  const route = fs.readFileSync(path.join(root, 'app/api/admin/ai/route.ts'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'app/admin/ai/page.tsx'), 'utf8');
  assert.match(route, /rpc\('prepare_admin_ai_update'/);
  assert.doesNotMatch(route, /rpc\('create_admin_broadcast_draft'/);
  assert.match(page, /Campus feed review/);
  assert.match(page, /separate notification draft/);
  assert.match(page, /Queue for review/);
});
