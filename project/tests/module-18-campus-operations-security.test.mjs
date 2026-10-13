import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync('supabase/migrations/20260911247000_0043_campus_operations_delivery_authority.sql', 'utf8');
const marketplace = readFileSync('lib/data/marketplace-client.ts', 'utf8');
const customerOrder = readFileSync('app/orders/[id]/page.tsx', 'utf8');
const vendorOrders = readFileSync('app/vendor-dashboard/orders/page.tsx', 'utf8');
const sw = readFileSync('public/sw.js', 'utf8');
const mapPreview = readFileSync('components/shared/map-preview.tsx', 'utf8');

test('handoff and completion are server-authoritative and participant-scoped', () => {
  assert.match(migration, /FUNCTION public\.customer_confirm_order_handoff/);
  assert.match(migration, /buyer_id=auth\.uid\(\)/);
  assert.match(migration, /v_order\.status NOT IN \('ready','out_for_delivery'\)/);
  assert.match(migration, /completed_at=now\(\)/);
  assert.match(migration, /order_fulfillment_events/);
  assert.match(migration, /order_fulfillment_events_participant_read/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.campus_delivery_zones, public\.order_fulfillment_events FROM authenticated/);
  assert.match(marketplace, /rpc\('customer_confirm_order_handoff'/);
  assert.match(customerOrder, /confirmOrderHandoff/);
  assert.match(vendorOrders, /Awaiting customer confirmation/);
  assert.doesNotMatch(vendorOrders, /updateOrderStatus\(orderId, 'completed'/);
});

test('vendor transitions preserve preparation and handoff while forbidding browser completion', () => {
  assert.match(migration, /FUNCTION public\.vendor_transition_order/);
  assert.match(migration, /p_next_status NOT IN \('accepted','processing','ready','out_for_delivery','cancelled'\)/);
  assert.match(migration, /v\.owner_id=auth\.uid\(\)/);
  assert.match(migration, /'ready_for_pickup'/);
  assert.match(migration, /'dispatched'/);
  assert.doesNotMatch(migration, /p_next_status NOT IN \('accepted','processing','ready','out_for_delivery','completed'/);
});

test('delivery-zone administration and offline rules remain scoped', () => {
  for (const fn of ['create_admin_campus_delivery_zone', 'update_admin_campus_delivery_zone']) assert.match(migration, new RegExp(`FUNCTION public\\.${fn}`));
  assert.match(migration, /can_manage_university\(p_university_id\)/);
  assert.match(migration, /record_trusted_admin_action\('delivery_zone\./);
  assert.match(sw, /if \(request\.method !== 'GET'\) return/);
  assert.match(sw, /Never queue or replay mutations offline/);
  assert.match(sw, /'\/orders'/);
  assert.match(sw, /'\/checkout'/);
  assert.match(mapPreview, /NEXT_PUBLIC_MAP_DIRECTIONS_URL_TEMPLATE/);
  assert.match(mapPreview, /\{lat\}/);
});

test('the model does not fabricate a driver authority', () => {
  assert.match(migration, /driver role\/table[\s\S]*existing model/);
  assert.doesNotMatch(migration, /driver_id\s+uuid/);
});
