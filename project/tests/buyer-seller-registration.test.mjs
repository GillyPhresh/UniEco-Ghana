import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const migration = read('supabase/migrations/20261117130000_0204_registration_account_boundaries.sql');

function loadModule(path, imports = {}) {
  const { outputText } = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  runInNewContext(outputText, { exports, require: (name) => imports[name] });
  return exports;
}

const policy = loadModule('lib/auth/registration-access.ts', { './redirects': loadModule('lib/auth/redirects.ts') });
const fixture = (state) => policy.parseRegistrationAccess({ allowed: false, status: 'registration_required', buyer_restricted: false, ...state });
const purposes = ['student_registration', 'vendor_registration', 'subscription', 'marketplace'];

test('student account choices are separate from the business lane', () => {
  const choices = read('components/registration/account-choices.tsx');
  assert.match(choices, /I’m joining as a student[\s\S]*choice\('buyer'\)[\s\S]*choice\('student'\)/);
  assert.match(choices, /I’m registering a business[\s\S]*choice\('external_vendor'\)/);
  assert.match(read('app/signup/page.tsx'), /<AccountChoices/);
  const buyer = read('app/onboarding/buyer/page.tsx');
  assert.match(buyer, /rpc\('complete_buyer_registration'/);
  assert.doesNotMatch(buyer, /Paystack|payment_required|startPaystackCheckout/);
  assert.match(migration, /IF account_status IS DISTINCT FROM 'buyer_setup_required'/);
  assert.match(migration, /WHERE id = p_university_id AND is_enabled/);
});

test('ordinary buyers, unknown entitlements and missing database rollout cannot initialize any Paystack purpose', () => {
  assert.equal(policy.parseRegistrationAccess({ allowed: true, status: 'paid' }), null);
  for (const access of [null,
    fixture({ buyer_restricted: true, status: 'buyer_setup_required', can_pay_student_registration: true }),
    fixture({ buyer_restricted: true, status: 'free_buyer', allowed: true, can_paystack: true, can_pay_vendor_registration: true }),
  ]) {
    for (const purpose of purposes) assert.equal(policy.canInitializePaystack(access, purpose), false, purpose);
  }
});

test('pending student sellers, businesses and deliberate upgrades only get their own checkout', () => {
  for (const [state, allowedPurpose] of [
    [{ registration_path: '/onboarding/student', can_pay_student_registration: true }, 'student_registration'],
    [{ registration_path: '/onboarding/vendor', can_pay_vendor_registration: true }, 'vendor_registration'],
    [{ buyer_restricted: true, allowed: true, seller_upgrade_started: true,
      can_pay_student_registration: true, can_paystack: true }, 'student_registration'],
  ]) {
    for (const purpose of purposes) assert.equal(policy.canInitializePaystack(fixture(state), purpose), purpose === allowedPurpose, purpose);
  }
  const paidSeller = fixture({ allowed: true, status: 'paid', can_paystack: true });
  assert.equal(policy.canInitializePaystack(paidSeller, 'marketplace'), true);
  assert.equal(policy.canInitializePaystack(paidSeller, 'student_registration'), false);
});

test('signup routes preserve the destination without moving referral codes between lanes', () => {
  const studentCode = 'UE-AAAAAAAAAAAAAAAAAAAA';
  const vendorCode = 'UEV-AAAAAAAAAAAAAAAAAAAA';
  assert.equal(policy.signupReferralCode(studentCode, 'buyer'), null);
  assert.equal(policy.signupReferralCode(studentCode.toLowerCase(), 'student'), studentCode);
  assert.equal(policy.signupReferralCode(vendorCode, 'student'), null);
  assert.equal(policy.signupReferralCode(studentCode, 'external_vendor'), null);
  assert.equal(policy.signupReferralCode(vendorCode, 'external_vendor'), vendorCode);
  assert.equal(policy.registrationDestination(fixture({ registration_path: '/onboarding/buyer' }), '/cart'), '/onboarding/buyer?next=%2Fcart');
  assert.equal(policy.registrationDestination(null, '/\t/foreign.test'), '/onboarding');
});

test('both Paystack routes and the payment ledger enforce registration boundaries before provider calls', () => {
  const checkout = read('app/payments/registration-checkout/route.ts');
  const init = read('app/api/payments/paystack/initialize/route.ts');
  assert.match(init, /rpc\('get_my_registration_access'\)[\s\S]*if \(!canInitializePaystack[\s\S]*await initializePaystackTransaction/);
  assert.match(checkout, /rpc\('get_my_registration_access'\)[\s\S]*registrationReminderRole\(access\)[\s\S]*if \(!role\)[\s\S]*await initializePaystackTransaction/);
  assert.match(migration, /NEW\.payment_type NOT IN \('student_registration', 'vendor_registration'\)[\s\S]*\(access_state ->> 'can_paystack'\)::boolean IS NOT TRUE/);
  assert.match(migration, /CREATE TRIGGER prevent_buyer_student_registration_payment BEFORE INSERT ON public\.payments/);
  const marketplace = read('app/checkout/page.tsx');
  assert.match(marketplace, /provider\.name !== 'paystack' \|\| registrationAccess\?\.can_paystack === true/);
  assert.match(marketplace, /provider: 'manual'/);
});

test('buyers retain community interactions and can’t publish or get referral links', () => {
  const feed = read('components/feed/campus-community-feed.tsx');
  assert.match(feed, /registrationAccess\?\.can_publish === true/);
  assert.match(feed, /if \(canFollow\) scopes\.push\(\{ id: 'following'/);
  assert.match(feed, /open=\{postOpen && canPost\}/);
  assert.match(migration, /IF \(access_state ->> 'buyer_restricted'\)::boolean OR NOT \(access_state ->> 'allowed'\)::boolean/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.can_use_campus_community/);
  assert.match(read('app/api/student-referrals/me/route.ts'), /!access\.can_student_referral/);
  assert.match(read('app/api/referrals/me/route.ts'), /!access\.can_vendor_referral && !access\.can_student_referral/);
});

test('business registration respects existing fee snapshots, verification and student coverage', () => {
  assert.match(migration, /WHERE vendor_id = NEW\.vendor_id AND owner_id = NEW\.user_id AND payment_id = NEW\.id/);
  assert.match(migration, /NEW\.amount = registration_state\.amount/);
  assert.match(migration, /state = 'awaiting_verification', payment_requirement = 'not_required', payment_id = NULL/);
  assert.match(read('app/onboarding/vendor/page.tsx'), /if \(coveredByStudentPayment\)[\s\S]*confirm_student_seller_business_coverage[\s\S]*purpose: 'vendor_registration'/);
});

test('buyer upgrade email is optional, verified, and email-only', () => {
  assert.match(read('app/onboarding/buyer/page.tsx'), /useState\(false\)[\s\S]*checked=\{marketingOptIn\}/);
  assert.match(migration, /IF opted_in AND EXISTS \(SELECT 1 FROM auth\.users WHERE id = uid AND email_confirmed_at IS NOT NULL/);
  assert.match(migration, /'buyer_seller_upgrade_promotion', uid, member\.email, NULL, 'Start selling on UniEco Ghana', ARRAY\['email'\]/);
  assert.match(migration, /'action_url', 'https:\/\/www\.uniecoghana\.com\/onboarding\/upgrade'/);
});
