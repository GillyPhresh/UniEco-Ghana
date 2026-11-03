import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('admin contact RPC is super-admin-only and bounds requested records', () => {
  const migration = read('supabase/migrations/20261103110000_0180_admin_user_contact_details.sql');
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_super_admin\(\)/);
  assert.match(migration, /cardinality\(p_user_ids\) > 100/);
  assert.match(migration, /profile\.id = ANY \(p_user_ids\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_user_contact_details\(uuid\[\]\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_admin_user_contact_details\(uuid\[\]\) TO authenticated/);
});

test('user directory displays phone actions only in the super-admin view', () => {
  const page = read('app/admin/users/page.tsx');
  const client = read('lib/data/admin-client.ts');
  assert.match(page, /isSuperAdmin && u\.phone/);
  assert.match(page, /isSuperAdmin && <TableHead>Phone<\/TableHead>/);
  assert.match(client, /get_admin_user_contact_details/);
  assert.match(client, /contactDetailsAvailable/);
});

test('marketplace landing queries surface real query failures instead of empty results', () => {
  const client = read('lib/data/marketplace-client.ts');
  for (const query of ['getTrendingProducts', 'getFeaturedServices', 'getDealsAndPromotions', 'getRecentlyAddedProducts']) {
    const start = client.indexOf(`export async function ${query}`);
    assert.notEqual(start, -1, `${query} exists`);
    const next = client.indexOf('\nexport async function ', start + 1);
    const body = client.slice(start, next === -1 ? undefined : next);
    assert.match(body, /const \{ data, error \} = await supabase/);
    assert.match(body, /if \(error\) throw new Error/);
  }
  const cartItems = client.slice(client.indexOf('export async function getCartItems'), client.indexOf('export async function addToCart'));
  assert.match(cartItems, /const \{ data \} = await supabase/);
  assert.doesNotMatch(cartItems, /const \{ data, error \}/);
});

test('appointment approval UI reports queued delivery, not completed delivery', () => {
  const page = read('app/admin/university-administrators/page.tsx');
  assert.match(page, /appointment email and official letters have been queued for delivery/i);
  assert.doesNotMatch(page, /appointment issued\./i);
});
