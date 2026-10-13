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

test('advertisement decisions require a reason and target-specific confirmation', async () => {
  const [migration, page, adminClient] = await Promise.all([
    read('supabase/migrations/20260930140000_0102_reasoned_advertisement_decisions.sql'),
    read('app/admin/advertisements/page.tsx'),
    read('lib/data/admin-client.ts'),
  ]);
  assert.match(migration, /is_super_admin\(\) OR public\.has_permission\('can_moderate_content'\)/);
  assert.match(migration, /v_reason IS NULL OR length\(v_reason\) NOT BETWEEN 10 AND 500/);
  assert.match(migration, /status='pending' FOR UPDATE/);
  assert.match(migration, /record_trusted_admin_action\([\s\S]*'reason',v_reason/);
  assert.match(page, /aria-label="Reason for rejection"/);
  assert.match(page, /Review reason \(required, 10–500 characters\)/);
  assert.match(page, /Confirm advertisement approval/);
  assert.match(page, /Confirm advertisement rejection/);
  assert.match(page, /approveAdvertisement\(selected\.id, priority, featured, sponsored, reason\)/);
  assert.match(adminClient, /p_featured: featured, p_sponsored: sponsored, p_rejection_reason: reason\.trim\(\)/);
  assert.doesNotMatch(page, /onClick=\{handleApprove\}|onClick=\{handleReject\}/);
});
