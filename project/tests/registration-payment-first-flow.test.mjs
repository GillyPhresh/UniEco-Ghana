import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('student registration starts the authoritative Paystack flow before activation', async () => {
  const [student, payments, migration] = await Promise.all([
    read('app/onboarding/student/page.tsx'),
    read('app/api/payments/paystack/initialize/route.ts'),
    read('supabase/migrations/20261028190000_0149_paid_registration_checkout_and_prompts.sql'),
  ]);
  assert.match(student, /startPaystackCheckout/);
  assert.match(student, /purpose: 'student_registration'/);
  assert.match(student, /Pay GH₵10 and continue/);
  assert.doesNotMatch(student, /Complete free registration/);
  assert.match(payments, /begin_student_registration_payment/);
  assert.match(migration, /payment.status = 'success'/);
  assert.match(migration, /status', CASE WHEN cash_authorized THEN 'cash_verified' WHEN paid THEN 'paid' ELSE 'payment_required'/);
});

test('registration payment communications include email and device push paths', async () => {
  const [migration, email, push] = await Promise.all([
    read('supabase/migrations/20261028190000_0149_paid_registration_checkout_and_prompts.sql'),
    read('supabase/functions/send-email/index.ts'),
    read('app/api/notifications/push-subscription/route.ts'),
  ]);
  assert.match(migration, /queue_registration_payment_prompt_after_profile/);
  assert.match(migration, /queue_registration_payment_push_after_subscription/);
  assert.match(migration, /queue_registration_payment_reminders/);
  assert.match(migration, /registration_payment_required/);
  assert.match(migration, /ARRAY\['push'\]::text\[\]/);
  assert.match(email, /template === 'registration_payment_required'/);
  assert.match(push, /push_subscriptions/);
});

test('Paystack callback routes both registration types to onboarding completion', async () => {
  const callback = await read('app/payments/callback/page.tsx');
  assert.match(callback, /payment\?\.payment_type === 'student_registration' \|\| payment\?\.payment_type === 'vendor_registration'/);
  assert.match(callback, /onboarding\/complete\?registration=paid/);
  assert.match(callback, /Try payment again/);
  assert.match(callback, /onboarding\/student\?payment_required=1/);
});
