import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = async (path) => (await readFile(new URL(path, root), 'utf8')).replace(/\r\n/g, '\n');

test('email signup is configured for immediate sessions and does not route through confirmation', async () => {
  const [config, auth, signup, verify] = await Promise.all([
    read('supabase/config.toml'),
    read('lib/auth/auth-context.tsx'),
    read('app/signup/page.tsx'),
    read('app/verify-email/page.tsx'),
  ]);
  assert.match(config, /\[auth\.email\][\s\S]*enable_confirmations = false/);
  assert.match(auth, /return \{ error: error\?\.message \?\? null, session: data\.session \}/);
  assert.match(signup, /if \(!session\)/);
  assert.doesNotMatch(signup, /router\.push\(['"]\/verify-email/);
  assert.doesNotMatch(verify, /We sent a verification link/);
});

test('Google registration keeps the selected intent and invite through onboarding', async () => {
  const [signup, onboarding, callback] = await Promise.all([
    read('app/signup/page.tsx'),
    read('app/onboarding/page.tsx'),
    read('app/auth/callback/route.ts'),
  ]);
  assert.match(signup, /unieco_pending_registration_invite/);
  assert.match(signup, /signInWithGoogle\(\{ intent: accountType \|\| 'student', next \}\)/);
  assert.match(onboarding, /pendingInvite/);
  assert.match(onboarding, /params\.set\('invite', pendingInvite\)/);
  assert.match(callback, /searchParams\.set\('payment_required', '1'\)/);
});

test('new users are gated through sign-in, secure onboarding, and their original destination', async () => {
  const [middleware, signin, onboarding, callback, paymentCallback] = await Promise.all([
    read('lib/supabase/middleware.ts'),
    read('app/signin/page.tsx'),
    read('app/onboarding/page.tsx'),
    read('app/auth/callback/route.ts'),
    read('app/payments/callback/page.tsx'),
  ]);
  assert.match(middleware, /const memberRoutePrefixes = \[/);
  assert.match(middleware, /if \(isMemberRoute && !user\)/);
  assert.match(middleware, /pathname === '\/' && Boolean\(user\)/);
  assert.match(signin, /router\.replace\(withNext\('\/onboarding', next\)\)/);
  assert.match(onboarding, /get_my_registration_access/);
  assert.match(onboarding, /registrationDestination\(user, requestedNext\)/);
  assert.match(callback, /if \(!intent && destination === '\/'\) safeDestination = '\/onboarding'/);
  assert.match(paymentCallback, /unieco_registration_next/);
  assert.match(paymentCallback, /onboarding\/complete\?registration=paid/);
});

test('cash registration links are a single-use audited exception and bypass Paystack only for valid tokens', async () => {
  const [migration, adminPage, studentPage, vendorPage, accessGate] = await Promise.all([
    read('supabase/migrations/20261020100000_0133_cash_registration_invites.sql'),
    read('app/admin/registration-invites/page.tsx'),
    read('app/onboarding/student/page.tsx'),
    read('app/onboarding/vendor/page.tsx'),
    read('supabase/migrations/20261019150000_0130_strict_paid_registration_access.sql'),
  ]);
  assert.match(migration, /get_registration_access_invite/);
  assert.match(migration, /redeem_cash_student_registration/);
  assert.match(migration, /redeem_cash_vendor_registration/);
  assert.match(migration, /redeemed_at IS NULL AND expires_at > now\(\)/);
  assert.match(migration, /cash_student_registration_redeemed/);
  assert.match(migration, /cash_vendor_registration_redeemed/);
  assert.match(migration, /cash_authorized/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_registration_access_invite/);
  assert.match(adminPage, /Cash registration links/);
  assert.match(adminPage, /instead of Paystack Mobile Money/);
  assert.match(studentPage, /redeem_cash_student_registration/);
  assert.match(studentPage, /Complete cash registration/);
  assert.match(vendorPage, /redeem_cash_vendor_registration/);
  assert.match(vendorPage, /Complete cash registration/);
  assert.match(accessGate, /payment_type = 'student_registration'/);
  assert.match(accessGate, /payment_type = 'vendor_registration'/);
});

test('student academic details are optional and selected from the mobile catalogue', async () => {
  const [schema, onboarding, catalogue, migration, paymentClient] = await Promise.all([
    read('lib/validation/index.ts'),
    read('app/onboarding/student/page.tsx'),
    read('lib/registration/academic-catalog.ts'),
    read('supabase/migrations/20261029120000_0159_optional_student_academic_fields.sql'),
    read('lib/data/payment-client.ts'),
  ]);
  assert.match(schema, /programme: z\.string\(\)\.max\(120[\s\S]*optional\(\)/);
  assert.match(schema, /index_number: z\.string\(\)\.max\(80[\s\S]*optional\(\)/);
  assert.match(onboarding, /ACADEMIC_PROGRAMMES/);
  assert.match(onboarding, /ACADEMIC_FACULTIES/);
  assert.match(onboarding, /ACADEMIC_DEPARTMENTS/);
  assert.match(onboarding, /RegistrationAutocomplete/);
  assert.match(onboarding, /CommandInput/);
  assert.match(onboarding, /Start typing your programme/);
  assert.match(onboarding, /Index \/ Student number <span className="font-normal text-muted-foreground">\(optional\)/);
  assert.match(catalogue, /Other \/ not listed yet/);
  assert.match(migration, /NULLIF\(trim\(p_student_id_number\),''\)/);
  assert.match(migration, /NULLIF\(trim\(p_program\),''\)/);
  assert.match(migration, /NULLIF\(trim\(p_faculty\),''\)/);
  assert.match(migration, /NULLIF\(trim\(p_department\),''\)/);
  assert.match(paymentClient, /studentIdNumber\?: string \| null/);
});
