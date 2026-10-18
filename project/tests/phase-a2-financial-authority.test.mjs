import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('financial workflow is database-authoritative and idempotent', async () => {
  const migration = await read('supabase/migrations/20260911230000_0030_phase_a2_financial_authority.sql');
  for (const name of [
    'create_subscription_payment_intent',
    'create_marketplace_checkout',
    'create_marketplace_payment_intent',
    'apply_verified_payment_webhook',
    'enforce_financial_rate_limit',
  ]) assert.match(migration, new RegExp(`FUNCTION public\\.${name}`));
  assert.match(migration, /payments_user_idempotency_key_unique/);
  assert.match(migration, /orders_buyer_checkout_idempotency_key_unique/);
  assert.match(migration, /stock_reservations/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.payments FROM authenticated/);
  assert.match(migration, /CASE WHEN p_provider = 'manual' THEN 'cash_on_delivery'/);
  assert.match(migration, /payment_row\.amount <> p_amount/);
});

test('production defaults leave every payment provider disabled', async () => {
  const migration = await read('supabase/migrations/20260911248000_0044_provider_defaults_disabled.sql');
  assert.match(migration, /UPDATE public\.payment_providers/);
  assert.match(migration, /SET is_enabled = false/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+public\.payment_providers/i);
});

test('browser payment and checkout clients cannot confirm payments or issue financial records', async () => {
  const [payments, checkout, marketplace, vendors] = await Promise.all([
    read('lib/data/payment-client.ts'),
    read('app/checkout/page.tsx'),
    read('lib/data/marketplace-client.ts'),
    read('lib/data/vendor-client.ts'),
  ]);
  for (const source of [payments, checkout, marketplace, vendors]) {
    assert.doesNotMatch(source, /\.from\('payments'\)\s*\.insert/);
    assert.doesNotMatch(source, /\.from\('payments'\)\s*\.update/);
    assert.doesNotMatch(source, /\.from\('receipts'\)\s*\.insert/);
  }
  assert.match(payments, /create_subscription_payment_intent/);
  assert.match(payments, /create_marketplace_payment_intent/);
  assert.match(marketplace, /create_marketplace_checkout/);
  assert.doesNotMatch(marketplace, /\.from\('coupon_redemptions'\)\s*\.insert/);
  assert.match(checkout, /idempotency_key: crypto\.randomUUID\(\)/);
  assert.match(vendors, /Subscriptions activate only after a verified provider payment/);
});

test('referral UI uses trusted summary RPCs and never writes financial tables directly', async () => {
  const [payments, studentReferrals, studentApi, adminReferrals, adminApi, migration] = await Promise.all([
    read('lib/data/payment-client.ts'),
    read('app/dashboard/referrals/page.tsx'),
    read('app/api/student-referrals/me/route.ts'),
    read('app/admin/referrals/page.tsx'),
    read('app/api/admin/student-referrals/route.ts'),
    read('supabase/migrations/20261017180000_0107_student_referral_replacement.sql'),
  ]);
  assert.match(studentApi, /rpc\('get_my_referral_summary'/);
  assert.match(studentApi, /\/signup\?ref=/);
  assert.match(adminApi, /rpc\('get_admin_student_referral_overview'/);
  assert.match(studentReferrals, /\/api\/student-referrals\/me/);
  assert.match(adminReferrals, /\/api\/admin\/student-referrals/);
  for (const source of [payments, studentReferrals, studentApi, adminReferrals, adminApi]) {
    assert.doesNotMatch(source, /\.from\('(student_referral_rewards|student_referral_payouts|payments)'\)\s*\.(insert|update|delete)/);
  }
  assert.match(migration, /UNIQUE REFERENCES public\.payments\(id\)/);
  assert.match(migration, /referrer_user_id\s*<>\s*referred_user_id/);
  assert.match(migration, /available_at timestamptz NOT NULL/);
  const settlementSchedule = await read('supabase/migrations/20261018100000_0108_student_referral_settlement_schedule.sql');
  assert.match(settlementSchedule, /settle-student-referral-rewards-every-15-minutes/);
  assert.match(settlementSchedule, /settle_due_student_referral_rewards\(250\)/);
  assert.match(migration, /payout_pending/);
  assert.match(migration, /Super administrator access required/);
});

test('webhook and message attachments require protected server-side verification', async () => {
  const [webhook, attachmentMigration, communication, email, push, sms, whatsapp] = await Promise.all([
    read('supabase/functions/payment-webhook/index.ts'),
    read('supabase/migrations/20260911231000_0031_private_message_attachments.sql'),
    read('lib/data/communication-client.ts'),
    read('supabase/functions/send-email/index.ts'),
    read('supabase/functions/send-push/index.ts'),
    read('supabase/functions/send-sms/index.ts'),
    read('supabase/functions/send-whatsapp/index.ts'),
  ]);
  assert.match(webhook, /x-paystack-signature/);
  assert.match(webhook, /verif-hash/);
  assert.match(webhook, /apply_verified_payment_webhook/);
  assert.doesNotMatch(webhook, /Access-Control-Allow-Origin.*\*/);
  assert.match(attachmentMigration, /SET public = false/);
  assert.match(attachmentMigration, /message_attachment_participants_read/);
  assert.match(communication, /attachment:\/\//);
  assert.match(communication, /createSignedUrl/);
  assert.match(communication, /object\/public\/message-attachments/);
  for (const edgeFunction of [email, push, sms, whatsapp]) {
    assert.match(edgeFunction, /requireInternalRequest/);
  }
});

test('order workflow and subscription extension use narrow audited RPCs', async () => {
  const [migration, marketplace, admin, payments] = await Promise.all([
    read('supabase/migrations/20260911238000_0034_order_subscription_sensitive_mutation_hardening.sql'),
    read('lib/data/marketplace-client.ts'),
    read('lib/data/admin-client.ts'),
    read('lib/data/payment-client.ts'),
  ]);
  for (const name of [
    'customer_cancel_order',
    'vendor_transition_order',
    'vendor_update_order_notes',
    'vendor_update_booking_status',
    'admin_extend_subscription',
  ]) assert.match(migration, new RegExp(`FUNCTION public\\.${name}`));
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.orders FROM authenticated/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.order_status_history FROM authenticated/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.subscriptions FROM authenticated/);
  assert.match(migration, /Order transition is not allowed/);
  assert.match(migration, /Super administrator access required/);
  assert.match(marketplace, /rpc\('customer_cancel_order'/);
  assert.match(marketplace, /rpc\('vendor_transition_order'/);
  assert.match(marketplace, /rpc\('vendor_update_order_notes'/);
  assert.match(marketplace, /rpc\('vendor_update_booking_status'/);
  assert.match(admin, /rpc\('admin_extend_subscription'/);
  assert.doesNotMatch(payments, /from\('payment_providers'\)\.update/);
});
