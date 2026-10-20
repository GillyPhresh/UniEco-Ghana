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
  assert.match(callback, /payment_required=1/);
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
