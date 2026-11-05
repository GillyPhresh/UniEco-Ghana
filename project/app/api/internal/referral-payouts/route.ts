import { timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findMobileMoneyBankCode, transferOutcome } from '@/lib/referrals/paystack-payouts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });
const api = 'https://api.paystack.co';

function authorized(request: Request) {
  const expected = process.env.UNIECO_REFERRAL_PAYOUT_WORKER_TOKEN || '';
  const actual = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  const a = Buffer.from(expected); const b = Buffer.from(actual);
  return a.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
}
function liveReady() {
  const key = process.env.PAYSTACK_SECRET_KEY || '';
  return process.env.UNIECO_REFERRAL_PAYOUTS_ENABLED === 'true'
    && process.env.UNIECO_ENV === 'production'
    && process.env.PAYSTACK_MODE === 'live'
    && process.env.PAYSTACK_LIVE_ENABLED === 'true'
    && key.startsWith('sk_live_')
    && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
async function paystack(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${api}${path}`, { ...init, signal: controller.signal, headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json', ...(init.headers || {}),
    }, cache: 'no-store' });
    const payload = await response.json().catch(() => null) as { status?: boolean; data?: unknown } | null;
    return { response, payload };
  } finally { clearTimeout(timer); }
}
function record(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }

export async function POST(request: Request) {
  if (!authorized(request)) return json({ error: 'Not authorized.' }, 401);
  if (!liveReady()) return json({ error: 'Referral payouts are safely disabled until production Paystack configuration is complete.' }, 503);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const today = new Date();
  let reserved = 0;
  if (today.getUTCDay() === 1) {
    const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const { data, error } = await supabase.rpc('reserve_weekly_referral_payouts', { p_period_start: monday.toISOString().slice(0, 10), p_environment: 'live' });
    if (error) return json({ error: 'Weekly rewards could not be safely reserved.' }, 503);
    reserved = Number(data) || 0;
  }

  const runId = randomUUID();
  const summary = { reserved, checked: 0, submitted: 0, paid: 0, pending: 0, failed: 0, review: 0 };
  for (let count = 0; count < 20; count++) {
    const { data: payout, error: claimError } = await supabase.rpc('claim_referral_payout_for_worker', { p_run_id: runId, p_environment: 'live' });
    if (claimError) return json({ error: 'Payout queue could not be safely claimed.', ...summary }, 503);
    if (!record(payout)) break;
    summary.checked++;
    let outcome: ReturnType<typeof transferOutcome> = { status: 'reconciliation_required', failureCode: 'verification_unavailable' };
    let transferCode: string | null = null;
    let providerReference: string | null = null;
    let verifiedRecipient: string | null = typeof payout.recipient_code === 'string' ? payout.recipient_code : null;

    try {
      if (payout.action === 'submit') {
        let recipient = typeof payout.recipient_code === 'string' ? payout.recipient_code : null;
        if (!recipient) {
          const banks = await paystack('/bank?currency=GHS&type=mobile_money');
          const bankPayload = banks.payload as { data?: unknown } | null;
          const bankCode = findMobileMoneyBankCode(bankPayload?.data, String(payout.provider));
          if (!banks.response.ok || !bankPayload?.data || !bankCode) {
            await supabase.rpc('record_referral_paystack_result', { p_payout_id: payout.id, p_status: 'failed', p_failure_code: 'mobile_money_network_unavailable' });
            summary.failed++; continue;
          }
          const created = await paystack('/transferrecipient', { method: 'POST', body: JSON.stringify({
            type: 'mobile_money', name: payout.name, account_number: payout.mobile, mobile: payout.mobile,
            bank_code: bankCode, currency: 'GHS',
          }) });
          const recipientData = record(created.payload) && record(created.payload.data) ? created.payload.data : null;
          if (!created.response.ok || !recipientData || typeof recipientData.recipient_code !== 'string' || !/^RCP_[A-Za-z0-9]+$/.test(recipientData.recipient_code)) {
            // Recipient creation can time out after the provider accepted it. Do not retry blindly.
            await supabase.rpc('record_referral_paystack_result', { p_payout_id: payout.id, p_status: 'reconciliation_required', p_failure_code: 'recipient_creation_uncertain' });
            summary.review++; continue;
          }
          recipient = recipientData.recipient_code;
          verifiedRecipient = recipient;
          const { error: storeError } = await supabase.rpc('store_referral_paystack_recipient', { p_payout_id: payout.id, p_recipient_code: recipient });
          if (storeError) {
            await supabase.rpc('record_referral_paystack_result', { p_payout_id: payout.id, p_status: 'reconciliation_required', p_failure_code: 'recipient_storage_uncertain' });
            summary.review++; continue;
          }
        }
        const amount = Math.round(Number(payout.amount) * 100);
        if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000) {
          await supabase.rpc('record_referral_paystack_result', { p_payout_id: payout.id, p_status: 'reconciliation_required', p_failure_code: 'invalid_amount' });
          summary.review++; continue;
        }
        const submitted = await paystack('/transfer', { method: 'POST', body: JSON.stringify({
          source: 'balance', amount, currency: 'GHS', recipient, reference: payout.reference,
          reason: 'UniEco Ghana referral reward',
        }) });
        summary.submitted++;
        const transferData = record(submitted.payload) && record(submitted.payload.data) ? submitted.payload.data : null;
        if (transferData && typeof transferData.transfer_code === 'string') transferCode = transferData.transfer_code;
      } else if (payout.action !== 'verify') {
        await supabase.rpc('record_referral_paystack_result', { p_payout_id: payout.id, p_status: 'reconciliation_required', p_failure_code: 'unknown_worker_action' });
        summary.review++; continue;
      }

      // Always verify the reference; a successful POST response alone is not proof of payment.
      const checked = await paystack(`/transfer/verify/${encodeURIComponent(String(payout.reference))}`);
      const data = record(checked.payload) && record(checked.payload.data) ? checked.payload.data : null;
      if (!checked.response.ok || !checked.payload?.status || !data) {
        outcome = { status: 'reconciliation_required', failureCode: 'provider_verification_unavailable' };
      } else {
        const details = {
          reference: data.reference,
          amount: data.amount,
          currency: data.currency,
          status: data.status,
          recipient: record(data.recipient) ? data.recipient.recipient_code : undefined,
        };
        outcome = transferOutcome(details, { reference: String(payout.reference), amountPesewas: Math.round(Number(payout.amount) * 100), recipient: verifiedRecipient || undefined });
        transferCode = typeof data.transfer_code === 'string' ? data.transfer_code : transferCode;
        providerReference = typeof data.reference === 'string' ? data.reference : null;
      }
    } catch {
      // A network timeout is ambiguous. The next worker run will VERIFY, never resubmit.
      outcome = { status: 'reconciliation_required', failureCode: 'provider_timeout' };
    }
    const { error: recordError } = await supabase.rpc('record_referral_paystack_result', {
      p_payout_id: payout.id, p_status: outcome.status, p_transfer_code: transferCode,
      p_provider_reference: providerReference, p_failure_code: outcome.failureCode,
    });
    if (recordError) return json({ error: 'Provider result could not be recorded; payout locked for reconciliation.', ...summary }, 503);
    if (outcome.status === 'succeeded') summary.paid++;
    else if (outcome.status === 'pending') summary.pending++;
    else if (outcome.status === 'failed') summary.failed++;
    else summary.review++;
  }
  // Hash is deliberately only a run fingerprint; no user phone/name/provider secrets are logged.
  return json({ ...summary, run: createHash('sha256').update(runId).digest('hex').slice(0, 12) });
}
