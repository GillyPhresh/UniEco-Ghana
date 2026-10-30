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
  assert.match(source, /bind_legacy_paystack_environment/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /payment_reference/);
  assert.match(source, /p_amount: amountMinor \/ 100/);
  assert.match(source, /p_currency: currency/);
  assert.match(source, /manual-reconcile-/);
});

test('legacy reconciliation binds only missing environment metadata before retrying', async () => {
  const migration = await read('supabase/migrations/20261030130000_0162_legacy_paystack_reconciliation_retry.sql');
  assert.match(migration, /provider_environment IS NULL/);
  assert.match(migration, /p_amount/);
  assert.match(migration, /p_currency/);
  assert.match(migration, /service_role/);
  assert.match(migration, /Never overwrite a known environment/);
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

test('admin can retry provider verification for reconciliation-required payments', async () => {
  const adminPayments = await read('app/admin/payments/page.tsx');
  const callback = await read('app/payments/callback/page.tsx');
  const paymentTypes = await read('lib/types/payment.ts');
  assert.match(adminPayments, /value="reconciliation_required">Needs review/);
  assert.match(adminPayments, /\['pending', 'initiated', 'reconciliation_required'\]\.includes\(p\.status\)/);
  assert.match(callback, /!\['success', 'failed', 'cancelled', 'refunded'\]\.includes\(currentPayment\.status\)/);
  assert.match(paymentTypes, /reconciliation_required: \{ label: 'Needs review'/);
});

test('Paystack verification and admin retry cannot hang forever', async () => {
  const paystack = await read('lib/payments/paystack.server.ts');
  const adminPayments = await read('app/admin/payments/page.tsx');
  assert.match(paystack, /setTimeout\(\(\) => controller\.abort\(\), 15_000\)/);
  assert.match(adminPayments, /setTimeout\(\(\) => controller\.abort\(\), 30_000\)/);
  assert.match(adminPayments, /Verification timed out\. Please try again\./);
});

test('verified Paystack reconciliation keeps registration and subscription purposes separate', async () => {
  const migration = await read('supabase/migrations/20261030110000_0161_subscription_reconciliation_scope.sql');
  assert.match(migration, /ELSIF payment_row\.payment_type = 'subscription'/);
  assert.doesNotMatch(migration, /payment_row\.payment_type IN \('subscription', 'vendor_registration'\)/);
  assert.match(migration, /subscription_plan/);
  assert.match(migration, /auto_renew_value/);
  assert.match(migration, /Vendor registration is not a subscription/i);
  assert.doesNotMatch(migration, /payment_row\.amount = 20/);
});
