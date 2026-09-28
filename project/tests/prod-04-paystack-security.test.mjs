import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Paystack initialization is server-only, GHS-only, and guarded by explicit environment flags', async () => {
  const [adapter, route] = await Promise.all([read('lib/payments/paystack.server.ts'), read('app/api/payments/paystack/initialize/route.ts')]);
  assert.match(adapter, /import 'server-only'/);
  assert.match(adapter, /PAYSTACK_ENABLED/);
  assert.match(adapter, /PAYSTACK_LIVE_ENABLED/);
  assert.match(adapter, /key\.startsWith\('sk_test_'/);
  assert.match(adapter, /currency: 'GHS'/);
  assert.match(adapter, /Math\.round\(input\.amountGhs \* 100\)/);
  assert.match(route, /create_subscription_payment_intent/);
  assert.match(route, /create_marketplace_payment_intent/);
  assert.match(route, /record_paystack_checkout_initialized/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_PAYSTACK_SECRET/);
});

test('Paystack webhook uses raw-body HMAC plus provider transaction verification', async () => {
  const [webhook, migration] = await Promise.all([read('supabase/functions/payment-webhook/index.ts'), read('supabase/migrations/20260928010000_0048_paystack_authoritative_reconciliation.sql')]);
  assert.match(webhook, /hmacHex\("SHA-512", secret, raw\)/);
  assert.match(webhook, /x-paystack-signature/);
  assert.match(webhook, /transaction\/verify/);
  assert.match(webhook, /apply_verified_paystack_webhook/);
  assert.match(migration, /payment_reconciliation_events/);
  assert.match(migration, /payment_row\.amount <> p_amount/);
  assert.match(migration, /payment_row\.currency <> p_currency/);
  assert.match(migration, /provider_environment IS DISTINCT FROM p_provider_environment/);
  assert.match(migration, /ON CONFLICT\(provider,provider_event_id\) DO NOTHING/);
});

test('callback is UX-only and financial tables retain browser write protection', async () => {
  const [callback, payments, migration] = await Promise.all([read('app/payments/callback/page.tsx'), read('lib/data/payment-client.ts'), read('supabase/migrations/20260911230000_0030_phase_a2_financial_authority.sql')]);
  assert.match(callback, /\/api\/payments\/status/);
  assert.doesNotMatch(callback, /\.from\('payments'\)\.update/);
  assert.doesNotMatch(payments, /\.from\('payments'\)\s*\.update/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.payments FROM authenticated/);
  assert.match(migration, /payments_user_idempotency_key_unique/);
});

test('protected legacy Bolt project is absent from payment implementation', async () => {
  const sources = await Promise.all(['lib/payments/paystack.server.ts','app/api/payments/paystack/initialize/route.ts','app/api/payments/status/route.ts','supabase/functions/payment-webhook/index.ts','supabase/migrations/20260928010000_0048_paystack_authoritative_reconciliation.sql'].map(read));
  for (const source of sources) assert.doesNotMatch(source, /elxlrojlnusvybnfwxum/);
});
