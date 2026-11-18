import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const actor = { id: '10000000-0000-4000-8000-000000000001', email: 'vendor@example.test', role: 'student_vendor' };
const vendorId = '20000000-0000-4000-8000-000000000001';
const firstId = '30000000-0000-4000-8000-000000000001';
const payment = { id: firstId, user_id: actor.id, vendor_id: vendorId, payment_type: 'subscription',
  payment_reference: 'PAY-invoice-first', amount: 20, currency: 'GHS', status: 'initiated', provider: 'paystack',
  provider_checkout_initialized_at: null };
const checkoutUrl = 'https://checkout.paystack.com/checkout-test';

function fixture(overrides = {}) {
  const cfg = { student: true, verified: true, paystack: true, vendor: true, enabled: true, open: [], latest: null, intent: payment, ...overrides };
  const calls = [];
  let initializedIntent;
  const admin = {
    from(table) {
      const where = [];
      const record = (method, ...args) => { where.push([method, ...args]); return builder; };
      const result = () => {
        calls.push({ table, where });
        switch (table) {
          case 'vendors':
            assert.ok(where.some(([method, key, value]) => method === 'eq' && key === 'owner_id' && value === actor.id));
            return { data: cfg.vendor ? { is_student_business: cfg.student } : null };
          case 'student_profiles': return { data: { is_verified_student: cfg.verified } };
          case 'subscriptions': return { data: null };
          case 'payment_providers': return { data: { is_enabled: cfg.enabled, supported_methods: ['visa'], config: { channels: ['card'] } } };
          case 'payments':
            assert.deepEqual(where.filter(([method]) => method === 'eq').slice(0, 3), [
              ['eq', 'vendor_id', vendorId], ['eq', 'user_id', actor.id], ['eq', 'payment_type', 'subscription'],
            ]);
            return { data: where.some(([method]) => method === 'in') ? cfg.open : cfg.latest };
          default: throw Error('Unexpected table');
        }
      };
      const builder = {
        select: (...args) => record('select', ...args), eq: (...args) => record('eq', ...args),
        order: (...args) => record('order', ...args), limit: (...args) => record('limit', ...args),
        in: (...args) => record('in', ...args), maybeSingle: async () => result(),
        then: (resolve) => resolve(result()),
      };
      return builder;
    },
    async rpc(method, args) { calls.push({ method, args }); return { error: cfg.recordError }; },
  };
  const caller = {
    async rpc(method, args) {
      calls.push({ method, args });
      if (method === 'get_my_registration_access') return { data: { allowed: true, can_paystack: true, role: actor.role, status: 'active', buyer_restricted: !!cfg.buyer } };
      initializedIntent = args;
      return { data: cfg.intent };
    },
  };
  const load = testModules({
    'server-only': {},
    '@supabase/supabase-js': { createClient: () => admin },
    '@/lib/payments/paystack.server': {
      paystackIsEnabled: () => cfg.paystack, permittedChannels: () => ['card'], getPaystackMode: () => 'test',
      initializePaystackTransaction: async input => { calls.push({ providerInit: input }); return { authorizationUrl: checkoutUrl, reference: input.reference }; },
    },
    '@/lib/payments/paystack-reconciliation.server': {
      reconcilePaystackPayment: async reference => {
        calls.push({ verify: reference });
        if (cfg.verify instanceof Error) throw cfg.verify;
        return cfg.verify;
      },
    },
    '@/lib/payments/registration-checkout.server': {
      registrationCheckoutOrigin: () => 'https://www.uniecoghana.com',
      readHostedRegistrationCheckout: async (_admin, paymentId) => {
        calls.push({ readHosted: paymentId });
        return cfg.hosted;
      },
      saveHostedRegistrationCheckout: async (_admin, paymentId) => { calls.push({ saved: paymentId }); },
    },
  });
  const server = load('lib/payments/vendor-subscription.server.ts');
  const initialize = input => server.initializeVendorSubscription({ admin, caller, vendorId, actor, acceptedPrice: 20, checkoutVersion: null,
    requestUrl: 'https://www.uniecoghana.com/api/payments/paystack/initialize', ...input });
  return { admin, caller, server, initialize, calls, intent: () => initializedIntent };
}

test('plan prices require verified student eligibility, and stale coverage is not active', () => {
  const model = testModules()('lib/payments/vendor-subscription.ts');
  assert.equal(model.vendorSubscriptionPlans[model.vendorSubscriptionPlan(true, 'student_vendor', true)].price, 20);
  for (const [flag, role, verified] of [[true, 'student_vendor', false], [true, 'external_vendor', true], [false, 'student_vendor', true]]) {
    assert.equal(model.vendorSubscriptionPlans[model.vendorSubscriptionPlan(flag, role, verified)].price, 50);
  }
  assert.equal(model.vendorSubscriptionCoverage('active', '2026-11-18T12:00:00Z', Date.parse('2026-11-18T12:00:00Z')), 'expired');
  assert.equal(model.vendorSubscriptionCoverage('active', '2026-11-19T12:00:00Z', Date.parse('2026-11-18T12:00:00Z')), 'active');
});

test('billing snapshot is private, quotes the correct rate, and reads nothing for buyer or foreign account', async () => {
  const buyer = fixture({ buyer: true });
  assert.equal((await buyer.server.getVendorSubscriptionSnapshot(buyer.caller, actor.id, vendorId)).status, 403);
  assert.equal(buyer.calls.length, 1);
  const stranger = fixture({ vendor: false });
  assert.equal((await stranger.server.getVendorSubscriptionSnapshot(stranger.caller, actor.id, vendorId)).status, 404);
  assert.deepEqual(stranger.calls.filter(call => call.table).map(call => call.table), ['vendors']);
  const vendor = fixture({ verified: false, enabled: false, open: [{ ...payment, status: 'reconciliation_required' }], latest: payment });
  const response = await vendor.server.getVendorSubscriptionSnapshot(vendor.caller, actor.id, vendorId);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const data = await response.json();
  assert.equal(data.price, 50);
  assert.equal(data.paystackAvailable, false);
  assert.equal(data.openPayment.canResume, false);
  assert.doesNotMatch(JSON.stringify(data), /vendor@example\.test|authorization_url|supported_methods/);
});

test('two subscription starts for the same ledger version reserve the same one-time reference', async () => {
  const env = fixture();
  const otherTab = fixture();
  const [a, b] = await Promise.all([env.initialize(), otherTab.initialize()]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(env.intent().p_idempotency_key, otherTab.intent().p_idempotency_key);
  assert.equal(env.intent().p_auto_renew, false);
  const provider = env.calls.find(call => call.providerInit).providerInit;
  assert.equal(provider.amountGhs, 20);
  assert.equal(provider.reference, payment.payment_reference);
  assert.equal(provider.callbackUrl, 'https://www.uniecoghana.com/payments/callback?flow=subscription');
  assert.equal(env.calls.find(call => call.saved)?.saved, payment.id);
  assert.equal((await a.json()).authorizationUrl, checkoutUrl);
});

test('stale checkout versions and changed prices cannot start a provider charge', async () => {
  for (const env of [fixture({ latest: payment }), fixture({ verified: false })]) {
    assert.equal((await env.initialize()).status, 409);
    assert.equal(env.intent(), undefined);
    assert.equal(env.calls.some(call => call.providerInit), false);
  }
  const mismatch = fixture({ intent: { ...payment, amount: 50 } });
  assert.equal((await mismatch.initialize()).status, 409);
  assert.equal(mismatch.calls.some(call => call.providerInit), false);
});

test('an existing paid, pending, failed, ambiguous, or foreign-provider attempt is never charged again', async () => {
  const open = [{ ...payment, status: 'pending', provider_checkout_initialized_at: '2026-11-18T12:00:00Z' }];
  const cases = [
    [{ open, verify: { status: 'success', applied: true } }, 200, { alreadyPaid: true }],
    [{ open, verify: { status: 'pending' }, hosted: checkoutUrl }, 200, { authorizationUrl: checkoutUrl }],
    [{ open, verify: { status: 'pending' } }, 409],
    [{ open, verify: { status: 'failed', applied: true } }, 409],
    [{ open, verify: { status: 'reconciliation_required', applied: false } }, 409],
    [{ open, verify: new Error('timeout') }, 503],
    [{ open: [{ ...payment, provider: 'manual' }] }, 409],
    [{ open: [payment, { ...payment, id: 'other' }] }, 409],
  ];
  for (const [config, status, expected] of cases) {
    const env = fixture(config);
    const response = await env.initialize();
    assert.equal(response.status, status);
    if (expected) {
      const body = await response.json();
      for (const [key, value] of Object.entries(expected)) assert.equal(body[key], value);
    }
    assert.equal(env.intent(), undefined);
    assert.equal(env.calls.some(call => call.providerInit), false);
  }
});

test('provider-confirmed not-found can only retry the original uninitialized reference', async () => {
  const verify = Object.assign(new Error('not found'), { code: 'not_found' });
  const env = fixture({ open: [payment], verify });
  assert.equal((await env.initialize()).status, 200);
  assert.equal(env.intent(), undefined);
  assert.equal(env.calls.find(call => call.providerInit).providerInit.reference, payment.payment_reference);
  const alreadyOpened = fixture({ open: [{ ...payment, provider_checkout_initialized_at: '2026-11-18T12:00:00Z' }], verify });
  assert.equal((await alreadyOpened.initialize()).status, 409);
  assert.equal(alreadyOpened.calls.some(call => call.providerInit), false);
});

test('verified Paystack renewals extend existing coverage and write the subscription invoice', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261030110000_0161_subscription_reconciliation_scope.sql', import.meta.url), 'utf8');
  assert.match(sql, /subscription_row\.status = 'active' AND subscription_row\.ends_at > now\(\)[\s\S]*?subscription_row\.ends_at \+ interval '30 days'[\s\S]*?starts_at_value \+ interval '30 days'/);
  assert.match(sql, /INSERT INTO public\.invoices[\s\S]*?'subscription'[\s\S]*?ON CONFLICT \(payment_id\).* DO NOTHING/);
  const callback = await readFile(new URL('../app/payments/callback/page.tsx', import.meta.url), 'utf8');
  assert.match(callback, /result\?\.payment_type === 'subscription'/);
  assert.match(callback, /isVendorPayment \? '\/vendor-dashboard\/invoices'/);
});
