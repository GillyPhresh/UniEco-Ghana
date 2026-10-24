import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('student registration completes free while paid Paystack flows remain server-controlled', async () => {
  const [route, adapter, onboarding, callback] = await Promise.all([
    read('app/api/payments/paystack/initialize/route.ts'), read('lib/payments/paystack.server.ts'),
    read('app/onboarding/student/page.tsx'), read('app/payments/callback/page.tsx'),
  ]);
  assert.match(route, /begin_vendor_registration_payment/);
  assert.match(route, /amountGhs: Number\(payment\.amount\)/);
  assert.match(adapter, /Math\.round\(input\.amountGhs \* 100\)/);
  assert.match(onboarding, /complete_student_registration/);
  assert.doesNotMatch(onboarding, /purpose: 'student_registration'/);
  assert.match(onboarding, /registration=free/);
  assert.doesNotMatch(onboarding, /\.from\('payments'\)\s*\.(insert|update)/);
  assert.doesNotMatch(onboarding, /\.from\('student_profiles'\)\s*\.(insert|update)/);
  assert.match(callback, /\/api\/payments\/status/);
  assert.match(callback, /verified webhook/);
});

test('registration activation and referral reward are tied to verified payment transition', async () => {
  const [migration, webhook] = await Promise.all([
    read('supabase/migrations/20261017180000_0107_student_referral_replacement.sql'),
    read('supabase/functions/payment-webhook/index.ts'),
  ]);
  assert.match(migration, /CREATE TRIGGER apply_student_registration_payment_result AFTER UPDATE OF status ON public\.payments/);
  assert.match(migration, /NEW\.amount<>attempt\.expected_amount/);
  assert.match(migration, /NEW\.currency<>attempt\.expected_currency/);
  assert.match(migration, /NEW\.provider<>attempt\.provider/);
  assert.match(migration, /student_registration_payment_attempts/);
  assert.match(migration, /fee_snapshot_version/);
  assert.match(migration, /UPDATE public\.profiles SET status='active'/);
  assert.match(migration, /INSERT INTO public\.student_referral_rewards/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.match(webhook, /hmacHex\("SHA-512", secret, raw\)/);
  assert.match(webhook, /apply_verified_paystack_webhook/);
});

test('referral rewards and payout requests are ledger-backed and not browser-writable', async () => {
  const [migration, student, payoutApi] = await Promise.all([
    read('supabase/migrations/20261017180000_0107_student_referral_replacement.sql'),
    read('app/dashboard/referrals/page.tsx'),
    read('app/api/admin/student-referrals/route.ts'),
  ]);
  assert.match(migration, /registration_fee numeric\(12,2\) NOT NULL DEFAULT 10\.00/);
  assert.match(migration, /referral_reward numeric\(12,2\) NOT NULL DEFAULT 2\.00/);
  assert.match(migration, /reward_settlement_hours integer NOT NULL DEFAULT 168/);
  assert.match(migration, /minimum_payout numeric\(12,2\) NOT NULL DEFAULT 10\.00/);
  assert.match(migration, /UNIQUE\s*\(user_id\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.request_my_referral_payout/);
  assert.match(migration, /Referral payouts are not enabled yet/);
  assert.match(student, /\/api\/student-referrals\/me/);
  assert.doesNotMatch(student, /\.from\('(student_referral_rewards|student_referral_payouts|payments)'\)\s*\.(insert|update|delete)/);
  assert.doesNotMatch(payoutApi, /service_role|PAYSTACK_SECRET_KEY/);
});

test('referral migration preserves role helper and separates read summary from settlement', async () => {
  const migration = await read('supabase/migrations/20261017180000_0107_student_referral_replacement.sql');
  const summary = migration.match(/CREATE OR REPLACE FUNCTION public\.get_my_referral_summary\(\)([\s\S]*?)END \$\$;/)?.[1] ?? '';
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.current_app_role\(/);
  assert.match(migration, /public\.current_app_role\(\) NOT IN \('student','student_vendor'\)/);
  assert.doesNotMatch(summary, /\b(UPDATE|INSERT|DELETE|PERFORM)\b/i);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.settle_due_student_referral_rewards/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.settle_due_student_referral_rewards\(integer\) TO service_role/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.student_referral_reward_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.student_referral_payout_allocations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.student_referral_reversal_cases/);
  assert.match(migration, /student_profiles verified_student/);
  assert.match(migration, /Referral payouts are not enabled yet/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.try_qualify_student_referral/);
});
