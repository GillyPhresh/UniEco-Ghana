import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('campaign lifecycle is narrow, audited, and never browser-financial', async () => {
  const migration = await read('supabase/migrations/20260911245000_0041_advertising_campaign_authority.sql');
  for (const fn of ['create_own_ad_campaign','review_admin_ad_campaign','activate_admin_ad_campaign','cancel_own_ad_campaign','get_active_promoted_listings']) assert.match(migration, new RegExp(`FUNCTION public\\.${fn}`));
  assert.match(migration, /actual_spend numeric[\s\S]*DEFAULT 0/);
  assert.match(migration, /owner_id=auth\.uid\(\)/);
  assert.match(migration, /reviewed_by=auth\.uid\(\),reviewed_at=now\(\)/);
  assert.match(migration, /record_trusted_admin_action/);
  assert.match(migration, /REVOKE INSERT,UPDATE,DELETE ON public\.ad_requests,public\.advertisements,public\.featured_listings,public\.ad_campaigns FROM authenticated/);
  assert.doesNotMatch(migration, /payment_provider|provider_reference|mark_paid/i);
});

test('paid placements have visible labels and separate public listing read', async () => {
  const [migration, label] = await Promise.all([
    read('supabase/migrations/20260911245000_0041_advertising_campaign_authority.sql'),
    read('components/analytics/promoted-label.tsx'),
  ]);
  assert.match(migration, /CASE WHEN f\.placement_type='featured' THEN 'Featured' ELSE 'Sponsored' END/);
  assert.match(label, /Sponsored' \| 'Featured' \| 'Promoted/);
  assert.match(label, /ad_impression/);
});

test('vendor promotion flow uses campaign RPCs instead of direct request writes', async () => {
  const vendor = await read('lib/data/vendor-client.ts');
  assert.match(vendor, /rpc\('create_own_ad_campaign'/);
  assert.match(vendor, /rpc\('cancel_own_ad_campaign'/);
  assert.doesNotMatch(vendor, /from\('ad_requests'\)[\s\S]{0,160}?\.(?:insert|update|delete)\(/);
});
