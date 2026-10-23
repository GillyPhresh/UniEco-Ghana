import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = async (path) => (await readFile(new URL(path, root), 'utf8')).replace(/\r\n/g, '\n');

test('payment reconciliation verifies with Paystack before applying through the protected RPC', async () => {
  const source = await read('lib/payments/paystack-reconciliation.server.ts');
  assert.match(source, /import 'server-only'/);
  assert.match(source, /verifyPaystackTransaction/);
  assert.match(source, /apply_verified_paystack_webhook/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /payment_reference/);
  assert.match(source, /p_amount: amountMinor \/ 100/);
  assert.match(source, /p_currency: currency/);
});

test('user reconciliation remains scoped to the authenticated payer', async () => {
  const source = await read('app/api/payments/reconcile/route.ts');
  assert.match(source, /auth\.getUser/);
  assert.match(source, /\.eq\('user_id', user\.id\)/);
  assert.match(source, /reconcilePaystackPayment/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('admin reconciliation requires the database-backed super-admin role', async () => {
  const source = await read('app/api/admin/payments/reconcile/route.ts');
  assert.match(source, /rpc\('is_super_admin'\)/);
  assert.match(source, /isSuperAdmin !== true/);
  assert.match(source, /reconcilePaystackPayment/);
});

test('Paystack webhook binds environment to the verified server secret', async () => {
  const source = await read('supabase/functions/payment-webhook/index.ts');
  assert.match(source, /secret\.startsWith\('sk_live_'\)/);
  assert.match(source, /secret\.startsWith\('sk_test_'\)/);
  assert.match(source, /p_provider_environment: event\.providerEnvironment/);
});

test('payment and role management surfaces provide phone-sized representations', async () => {
  const pages = [
    'app/admin/payments/page.tsx',
    'app/admin/roles/page.tsx',
    'app/vendor-dashboard/financial/page.tsx',
    'app/vendor-dashboard/payment-history/page.tsx',
    'app/vendor-dashboard/invoices/page.tsx',
  ];
  for (const page of pages) {
    const source = await read(page);
    assert.match(source, /lg:hidden/, `${page} is missing a mobile representation`);
    assert.match(source, /hidden[^"\n]*lg:block/, `${page} is missing a desktop representation`);
  }
});
