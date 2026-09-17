import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('analytics events are bounded, privacy-minimized, and cannot represent financial authority', async () => {
  const migration = await read('supabase/migrations/20260911244000_0040_privacy_safe_analytics.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.analytics_events/);
  assert.match(migration, /ALTER TABLE public\.analytics_events ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /jsonb_array_length\(p_events\) NOT BETWEEN 1 AND 20/);
  assert.match(migration, /auth\.uid\(\) IS NULL/);
  assert.doesNotMatch(migration, /password|private_message|document_url|service_role_secret/i);
  assert.doesNotMatch(migration, /payment_successful|order_completed|vendor_approved|ad_billing/);
});

test('analytics dashboards derive finance from authoritative records and enforce scope', async () => {
  const migration = await read('supabase/migrations/20260911244000_0040_privacy_safe_analytics.sql');
  assert.match(migration, /FUNCTION public\.get_platform_analytics_dashboard/);
  assert.match(migration, /FUNCTION public\.get_university_analytics_dashboard/);
  assert.match(migration, /FUNCTION public\.get_vendor_analytics_dashboard/);
  assert.match(migration, /public\.is_staff\(\)/);
  assert.match(migration, /owner_id=auth\.uid\(\)/);
  assert.match(migration, /university_admin_memberships/);
  assert.match(migration, /FROM public\.payments/);
  assert.match(migration, /status='completed'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated,service_role/);
});

test('browser analytics batches only approved events and never reads operational analytics tables', async () => {
  const [client, tracker, vendor] = await Promise.all([
    read('lib/data/analytics-client.ts'), read('components/analytics/page-view-tracker.tsx'), read('lib/data/vendor-client.ts'),
  ]);
  assert.match(client, /record_analytics_events/);
  assert.match(client, /pending\.push/);
  assert.match(client, /setTimeout/);
  assert.doesNotMatch(client, /service_role|payment|message body/i);
  assert.match(tracker, /page_view/);
  assert.match(vendor, /get_vendor_analytics_dashboard/);
  assert.doesNotMatch(vendor, /from\('vendor_analytics'\)\s*\.insert/);
});
