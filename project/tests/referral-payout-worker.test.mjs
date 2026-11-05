import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../app/api/internal/referral-payouts/route.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261104100000_0181_referral_weekly_paystack_payouts.sql', import.meta.url), 'utf8');
const payouts = await readFile(new URL('../lib/referrals/paystack-payouts.ts', import.meta.url), 'utf8');
const settings = await readFile(new URL('../app/api/referrals/payout-settings/route.ts', import.meta.url), 'utf8');

test('live payouts require explicit production and live Paystack gates', () => {
  for (const gate of ["UNIECO_REFERRAL_PAYOUTS_ENABLED === 'true'", "UNIECO_ENV === 'production'", "PAYSTACK_MODE === 'live'", "PAYSTACK_LIVE_ENABLED === 'true'", "startsWith('sk_live_')"]) assert.ok(worker.includes(gate));
});
test('worker never retries a transfer POST for a claimed verification action', () => {
  assert.match(worker, /payout\.action === 'submit'/);
  assert.match(worker, /payout\.action !== 'verify'/);
  assert.match(worker, /\/transfer\/verify\//);
  assert.match(migration, /next_action:='verify'/);
  assert.match(worker, /p_environment: 'live'/);
  assert.match(migration, /p_environment IS DISTINCT FROM 'live'/);
  assert.match(migration, /WHERE environment=p_environment AND status='queued'/);
});
test('only exact amount, currency, reference and recipient can be marked successful', () => {
  assert.match(payouts, /value\.reference !== expected\.reference/);
  assert.match(payouts, /Number\(value\.amount\) !== expected\.amountPesewas/);
  assert.match(payouts, /value\.currency !== 'GHS'/);
  assert.match(payouts, /value\.recipient !== expected\.recipient/);
});
test('user payout destination is authenticated, role-limited and origin-checked on writes', () => {
  assert.match(settings, /supabase\.auth\.getUser\(\)/);
  assert.match(settings, /sameOrigin\(request\)/);
  assert.match(settings, /student_vendor.*external_vendor/);
  assert.match(migration, /right\(d\.mobile_number,4\)/);
});
test('weekly payout reservation is idempotent and uses isolated owner allocations', () => {
  assert.match(migration, /UNIQUE \(user_id, period_start, environment\)/);
  assert.match(migration, /referral_payout_alloc_student_uidx/);
  assert.match(migration, /referral_payout_alloc_vendor_uidx/);
  assert.match(migration, /p_environment IS DISTINCT FROM 'live'/);
  assert.match(worker, /source: 'balance', amount, currency: 'GHS'/);
  assert.match(migration, /payout_id,student_reward_id/);
  assert.match(migration, /payout_id,vendor_reward_id/);
});
test('Paystack verification checks the exact recipient, including a recipient created in this run', () => {
  assert.match(worker, /verifiedRecipient = recipient/);
  assert.match(worker, /recipient: verifiedRecipient \|\| undefined/);
});
