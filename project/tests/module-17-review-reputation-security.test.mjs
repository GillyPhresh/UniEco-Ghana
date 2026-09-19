import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync('supabase/migrations/20260911246000_0042_trusted_reviews_reputation.sql', 'utf8');
const student = readFileSync('lib/data/student-client.ts', 'utf8');
const vendor = readFileSync('lib/data/vendor-client.ts', 'utf8');
const marketplace = readFileSync('lib/data/marketplace-client.ts', 'utf8');

test('review creation is transaction-backed and browser identity is not trusted', () => {
  assert.match(migration, /FUNCTION public\.create_verified_review/);
  assert.match(migration, /auth\.uid\(\) IS NULL/);
  assert.match(migration, /o\.buyer_id=auth\.uid\(\)/);
  assert.match(migration, /o\.status\s*=\s*'completed'/);
  assert.match(migration, /o\.university_id IS NOT DISTINCT FROM p\.university_id/);
  assert.match(migration, /b\.vendor_id=o\.vendor_id/);
  assert.match(migration, /reviews_verified_vendor_once_per_order/);
  assert.match(migration, /reviews_verified_product_once_per_order/);
  assert.match(migration, /reviews_verified_service_once_per_order/);
  assert.match(migration, /is_approved\) VALUES\(auth\.uid\(\)/);
  assert.doesNotMatch(student, /from\('reviews'\)\.insert/);
  assert.doesNotMatch(marketplace, /from\('reviews'\)\.insert/);
  assert.match(marketplace, /rpc\('create_verified_review'/);
  assert.doesNotMatch(student, /is_approved:\s*true/);
});

test('vendor responses are owner-scoped and no direct response mutation remains', () => {
  assert.match(migration, /FUNCTION public\.upsert_own_review_response/);
  assert.match(migration, /v\.owner_id=auth\.uid\(\)/);
  assert.match(vendor, /rpc\('upsert_own_review_response'/);
  assert.doesNotMatch(vendor, /from\('review_responses'\)\.(insert|update|upsert|delete)/);
});

test('moderation and rating aggregation are trusted', () => {
  assert.match(migration, /FUNCTION public\.moderate_admin_review/);
  assert.match(migration, /NOT public\.is_staff\(\)/);
  assert.match(migration, /moderated_by,moderated_at/);
  assert.match(migration, /moderated_by=EXCLUDED\.moderated_by,moderated_at=EXCLUDED\.moderated_at/);
  assert.match(migration, /record_trusted_admin_action\('review\.'/);
  assert.match(migration, /FUNCTION public\.recalculate_vendor_reputation/);
  assert.match(migration, /reviews_reputation_refresh/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.reviews, public\.review_responses, public\.review_moderation FROM authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.create_verified_review\([\s\S]*FROM PUBLIC,anon,authenticated,service_role/);
});

test('trusted reputation maintenance helpers cannot be invoked through the API', () => {
  const correction = readFileSync('supabase/migrations/20260911249000_0045_review_reputation_privilege_correction.sql', 'utf8');
  assert.match(correction, /REVOKE ALL ON FUNCTION public\.recalculate_vendor_reputation\(uuid\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(correction, /REVOKE ALL ON FUNCTION public\.refresh_review_reputation\(\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(correction, /REVOKE ALL ON FUNCTION public\.refresh_review_moderation_reputation\(\) FROM PUBLIC, anon, authenticated, service_role/);
});

test('unsupported event participation is not faked', () => {
  assert.match(migration, /p_target_type NOT IN \('vendor','product','service'\)/);
  assert.match(student, /Reviews require a completed product, service, or business order/);
});
