import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = async (path) => (await readFile(new URL(path, root), 'utf8')).replace(/\r\n/g, '\n');

test('payment reconciliation verifies with Paystack before applying through the protected RPC', async () => {
  const source = await read('lib/payments/paystack-reconciliation.server.ts');
  const schema = await read('supabase/migrations/20260911230000_0030_phase_a2_financial_authority.sql');
  assert.match(source, /import 'server-only'/);
  assert.match(source, /verifyPaystackTransaction/);
  assert.match(source, /apply_verified_paystack_webhook/);
  assert.match(source, /bind_legacy_paystack_environment/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /payment_reference/);
  assert.match(source, /p_amount: amountMinor \/ 100/);
  assert.match(source, /p_currency: currency/);
  assert.match(source, /provider_environment/);
  assert.match(source, /verifyPaystackTransaction\(reference, environment\)/);
  assert.match(source, /not a mutable global PAYSTACK_MODE/);
  assert.match(source, /manual-reconcile-/);
  assert.match(source, /reconciliation: \{ source: 'admin_manual_verification', event_id: retryEventId \}/);
  assert.match(schema, /UNIQUE\s*\(provider,\s*payload_hash\)/i);
});

test('verification selects a secret that matches the stored payment environment and parses provider responses safely', async () => {
  const paystack = await read('lib/payments/paystack.server.ts');
  const verifier = paystack.slice(paystack.indexOf('export async function verifyPaystackTransaction'));
  assert.match(paystack, /verificationSecret\(expectedMode: PaystackMode\)/);
  assert.match(paystack, /key\.startsWith\(prefix\)/);
  assert.match(paystack, /expectedMode === 'live'.*UNIECO_ENV !== 'production'/s);
  assert.match(verifier, /response\.text\(\)/);
  assert.match(verifier, /invalid_response/);
  assert.doesNotMatch(verifier, /await response\.json\(\)/);
});

test('production reconciliation always checks Paystack Live for legacy test-marked rows', async () => {
  const source = await read('lib/payments/paystack-reconciliation.server.ts');
  const verifier = await read('lib/payments/paystack.server.ts');
  assert.match(source, /process\.env\.UNIECO_ENV === 'production'[\s\S]*?\? 'live'/);
  assert.match(source, /verified Paystack result/i);
  assert.match(verifier, /'not_found'/);
  assert.match(verifier, /expectedMode === 'live'.*not found/i);
});

test('verified live recovery only repairs unresolved environment metadata and never marks payments paid itself', async () => {
  const migration = await read('supabase/migrations/20261031120000_0165_verified_live_environment_recovery.sql');
  const reconciliation = await read('lib/payments/paystack-reconciliation.server.ts');
  assert.match(migration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(migration, /OLD\.provider_environment IS NOT DISTINCT FROM 'test'[\s\S]*NEW\.provider_environment IS NOT DISTINCT FROM 'live'/);
  assert.match(migration, /status IN \('initiated', 'pending', 'reconciliation_required'\)/);
  assert.match(migration, /payment_row\.amount IS DISTINCT FROM p_amount/);
  assert.match(migration, /payment_row\.currency IS DISTINCT FROM upper\(p_currency\)/);
  assert.match(migration, /never changes payment status/i);
  assert.doesNotMatch(migration, /SET status\s*=/i);
  assert.match(reconciliation, /amountMinor \/ 100/);
  assert.ok(reconciliation.indexOf('currency !== \'GHS\'') < reconciliation.indexOf("client.rpc('bind_legacy_paystack_environment'"));
  assert.ok(reconciliation.indexOf("client.rpc('bind_legacy_paystack_environment'") < reconciliation.indexOf("if (!status)"));
});

test('missing live transaction gets a clear non-mutating admin response', async () => {
  const route = await read('app/api/admin/payments/reconcile/route.ts');
  const verifier = await read('lib/payments/paystack.server.ts');
  assert.match(verifier, /expectedMode === 'live' && \/not found\|does not exist\//i);
  assert.match(route, /code === 'not_found'[\s\S]*restart registration checkout in production/);
  assert.match(route, /code === 'not_found' \? 422/);
});

test('a retried live checkout aligns pending registration metadata without granting access', async () => {
  const migration = await read('supabase/migrations/20261031130000_0166_live_checkout_attempt_environment.sql');
  assert.match(migration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(migration, /payment_row\.status NOT IN \('initiated', 'pending'\)/);
  assert.match(migration, /attempt_row\.provider_environment = 'test'[\s\S]*p_provider_environment = 'live'/);
  assert.match(migration, /app\.verified_paystack_attempt_environment/);
  assert.match(migration, /status = 'pending'/);
  assert.doesNotMatch(migration, /SET status\s*=\s*'success'/i);
  assert.match(migration, /never marks payment successful/i);
});

test('registration retries verify a quarantined attempt before allowing another charge', async () => {
  const route = await read('app/api/payments/paystack/initialize/route.ts');
  const checkout = await read('app/onboarding/student/page.tsx');
  assert.match(route, /\.eq\('user_id', user\.id\)/);
  assert.match(route, /\.in\('status', \['success', 'reconciliation_required'\]\)/);
  assert.match(route, /reconcilePaystackPayment\(quarantined\.payment_reference\)/);
  assert.match(route, /We will not start a second charge while this one is unresolved/);
  assert.match(route, /alreadyPaid: true/);
  assert.match(route, /recovery\.applied && \['failed', 'cancelled'\]/);
  assert.match(checkout, /payment\.alreadyPaid/);
  assert.match(checkout, /payments\/callback\?reference=/);
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
