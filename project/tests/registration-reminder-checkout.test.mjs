import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(path, imports, env = {}) {
  const code = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  runInNewContext(outputText, { exports, require: (key) => imports[key], URL, console, process: { env } });
  return exports;
}

const origin = 'https://www.uniecoghana.com';
const hosted = 'https://checkout.paystack.com/test-only-example';
const access = load('lib/auth/registration-access.ts', {});
const helper = load('lib/payments/registration-checkout.server.ts', {
  'server-only': {},
  '@/lib/constants/site': { siteConfig: { url: origin } },
}, { UNIECO_ENV: 'production', UNIECO_PUBLIC_APP_URL: 'http://localhost:3000' });

const states = {
  student: { role: 'student', can_pay_student_registration: true },
  vendor: { role: 'external_vendor', can_pay_vendor_registration: true },
};

function routeFixture({ state = states.student, paymentStates = ['initiated'], reconciled = { status: 'pending' }, storedUrl = null, signedIn = true, prefetch = false } = {}) {
  const timeline = [];
  let attempt = 0;
  const user = { id: 'fixture-user', email: 'test@example.test' };
  const admin = {
    from(table) {
      const query = {
        select: () => query, eq: () => query,
        async maybeSingle() {
          if (table === 'payments') return { data: {
            id: 'payment-id', currency: 'GHS', amount: state.role === 'external_vendor' ? 20 : 10,
            provider_environment: 'live', status: paymentStates[attempt - 1],
            provider_checkout_initialized_at: paymentStates[attempt - 1] === 'pending' ? 'initialized' : null,
          } };
          return { data: { is_enabled: true, supported_methods: ['card'] } };
        },
      };
      return query;
    },
    async rpc(name) { timeline.push(name); return {}; },
  };
  const route = load('app/payments/registration-checkout/route.ts', {
    'node:crypto': { randomUUID: () => `fixture-${attempt}` },
    'next/server': { NextResponse: class {
      constructor(_, init) { Object.assign(this, init); }
      static redirect(url, init) { return { location: String(url), ...init }; }
    } },
    '@supabase/supabase-js': { createClient: () => admin },
    '@/lib/supabase/server': { createClient: () => ({
      auth: { getUser: async () => ({ data: { user: signedIn ? user : null } }) },
      async rpc(name) {
        timeline.push(name);
        if (name === 'get_my_registration_access') {
          return { data: { allowed: false, status: 'registration_required', buyer_restricted: false, ...state } };
        }
        attempt++;
        return { data: { payment_reference: `fixture-ref-${attempt}` } };
      },
    }) },
    '@/lib/payments/paystack.server': {
      getPaystackMode: () => 'live', paystackIsEnabled: () => true, permittedChannels: () => ['card'],
      async initializePaystackTransaction(input) { timeline.push(input); return { authorizationUrl: hosted }; },
    },
    '@/lib/payments/paystack-reconciliation.server': {
      async reconcilePaystackPayment(reference) { timeline.push(`verify:${reference}`); return reconciled; },
    },
    '@/lib/auth/registration-access': access,
    '@/lib/payments/registration-checkout.server': {
      ...helper,
      async readHostedRegistrationCheckout() { return storedUrl; },
      async saveHostedRegistrationCheckout() { timeline.push('store-hosted'); },
    },
  });
  const request = {
    url: 'http://localhost:8080/payments/registration-checkout?role=student',
    headers: new Headers(prefetch ? { 'Sec-Purpose': 'prefetch' } : {}),
  };
  return { route, timeline, request };
}

test('staff, free buyers, seller upgrades not requested from the app, and paid accounts never start checkout from a reminder', async () => {
  for (const state of [
    { role: 'super_admin', status: 'staff_exempt', can_pay_student_registration: true },
    { role: 'moderator', status: 'staff_exempt' },
    { role: 'university_admin', status: 'staff_exempt' },
    { buyer_restricted: true, seller_upgrade_started: true, can_pay_student_registration: true },
    { allowed: true, status: 'paid' },
  ]) {
    const { route, request, timeline } = routeFixture({ state });
    assert.equal((await route.GET(request)).location, `${origin}/payments/registration-status?state=no-fee`);
    assert.deepEqual(timeline, ['get_my_registration_access']);
  }
});

test('legacy role hints and localhost do not determine the Paystack lane or callback', async () => {
  const { route, request, timeline } = routeFixture({ state: states.vendor });
  const response = await route.GET(request);
  assert.equal(response.location, hosted);
  assert.match(response.headers['Cache-Control'], /no-store/);
  assert.equal(timeline[1], 'resume_vendor_registration_payment');
  assert.equal(timeline[2].amountGhs, 20);
  assert.equal(timeline[2].callbackUrl, `${origin}/payments/callback`);
  assert.equal(timeline[3], 'record_paystack_checkout_initialized');
  assert.equal(timeline[4], 'store-hosted');
});

test('repeated clicks reopen the stored hosted URL without starting another attempt', async () => {
  const { route, request, timeline } = routeFixture({ paymentStates: ['pending'], storedUrl: hosted });
  assert.equal((await route.GET(request)).location, hosted);
  assert.deepEqual(timeline, ['get_my_registration_access', 'resume_student_registration_payment', 'verify:fixture-ref-1']);
});

test('a retry is allowed only once Paystack verifies failure and the ledger applies it', async () => {
  for (const applied of [false, true]) {
    const { route, request, timeline } = routeFixture({
      paymentStates: ['pending', 'initiated'], reconciled: { status: 'cancelled', applied },
    });
    assert.equal((await route.GET(request)).location, applied ? hosted : `${origin}/payments/registration-status?state=check`);
    assert.equal(timeline.filter((event) => event === 'resume_student_registration_payment').length, applied ? 2 : 1);
  }
});

test('signed-out navigation preserves checkout; HEAD and prefetch do not create payment attempts', async () => {
  const anonymous = routeFixture({ signedIn: false });
  assert.equal(new URL((await anonymous.route.GET(anonymous.request)).location).searchParams.get('next'), '/payments/registration-checkout');
  const preview = routeFixture({ prefetch: true });
  assert.equal((await preview.route.GET(preview.request)).status, 204);
  assert.equal(preview.route.HEAD().status, 204);
  assert.deepEqual(preview.timeline, []);
});

test('cached checkout permits only a Paystack HTTPS checkout, not a look-alike hostname or redirect', () => {
  assert.equal(helper.isHostedRegistrationCheckout(hosted), true);
  for (const value of [
    'https://checkout.paystack.com.example.test/a', 'https://checkout.paystack.com@evil.test/a',
    'https://checkout.paystack.com/a?redirect=https://evil.test', 'http://checkout.paystack.com/a',
    'https://checkout.paystack.com:444/a', 'https://checkout.paystack.com/../a',
  ]) assert.equal(helper.isHostedRegistrationCheckout(value), false);
});
