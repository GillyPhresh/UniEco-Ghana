import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('referral dashboard supports direct growth sharing', () => {
  const page = read('app/dashboard/referrals/page.tsx');
  assert.match(page, /Share and grow/);
  assert.match(page, /Copy code/);
  assert.match(page, /Your referral code/);
  assert.match(page, /wa\.me/);
  assert.match(page, /Your UniEco impact is growing/);
  assert.match(page, /There is no limit to the number of genuine students/);
});

test('referral delivery repairs paid accounts and retries email safely', () => {
  const migration = read('supabase/migrations/20261021120000_0134_repair_referral_code_delivery.sql');
  const paidRegistrationTrigger = read('supabase/migrations/20261021130000_0135_referral_code_paid_registration_trigger.sql');
  const api = read('app/api/student-referrals/me/route.ts');
  const onboarding = read('app/onboarding/student/page.tsx');
  const email = read('supabase/functions/send-email/index.ts');

  assert.match(migration, /queue_referral_link_message_for_user/);
  assert.match(migration, /ensure_my_student_referral_link/);
  assert.match(migration, /attach_my_referral_code/);
  assert.match(migration, /communication_deliveries/);
  assert.match(migration, /status = 'queued'/);
  assert.match(migration, /registration\.status = 'paid'/);
  assert.match(paidRegistrationTrigger, /AFTER INSERT OR UPDATE OF status ON public\.student_registration_payments/);
  assert.match(paidRegistrationTrigger, /ensure_my_student_referral_link_for_user/);
  assert.match(api, /ensure_my_student_referral_link/);
  assert.match(api, /referralCode/);
  assert.match(api, /signup\?ref=/);
  assert.match(onboarding, /attach_my_referral_code/);
  assert.match(email, /meta\.referral_code/);
  assert.match(email, /Referral code/);
  assert.match(email, /Referral link/);
});

test('student profile explains verification progress without blocking referrals', () => {
  const page = read('app/profile/page.tsx');
  assert.match(page, /Complete your student verification/);
  assert.match(page, /Your verified status helps you access student opportunities/);
  assert.match(page, /Use the Academic tab below/);
});

test('health endpoint exposes deployment identity and disables caching', () => {
  const route = read('app/api/health/route.ts');
  assert.match(route, /RAILWAY_GIT_COMMIT_SHA/);
  assert.match(route, /Cache-Control/);
  assert.match(route, /no-store/);
});
