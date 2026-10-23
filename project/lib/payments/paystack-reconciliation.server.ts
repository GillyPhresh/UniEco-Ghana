import 'server-only';

import { createHash } from 'node:crypto';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getPaystackMode, verifyPaystackTransaction } from '@/lib/payments/paystack.server';

const PAYMENT_REFERENCE_PATTERN = /^[A-Za-z0-9._=-]{8,120}$/;

type PaystackVerification = Record<string, unknown> & {
  reference?: string;
  id?: string | number;
  status?: string;
  amount?: number | string;
  currency?: string;
};

function statusFromPaystack(value: unknown): 'success' | 'failed' | 'cancelled' | null {
  const status = String(value || '').toLowerCase();
  if (['success', 'successful', 'completed'].includes(status)) return 'success';
  if (['failed', 'failure'].includes(status)) return 'failed';
  if (['cancelled', 'canceled', 'abandoned'].includes(status)) return 'cancelled';
  return null;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Payment reconciliation is not configured.');
  return createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Reconciles one Paystack reference using Paystack's server-side verification
 * API, then applies the result through the service-role-only database function.
 * The browser never supplies status, amount, currency, or a payment id.
 */
export async function reconcilePaystackPayment(reference: string) {
  if (!PAYMENT_REFERENCE_PATTERN.test(reference)) throw new Error('Invalid payment reference.');

  const verified = await verifyPaystackTransaction(reference) as PaystackVerification;
  if (String(verified.reference || '') !== reference || verified.id === undefined || verified.id === null) {
    throw new Error('Paystack returned an unexpected payment reference.');
  }

  const status = statusFromPaystack(verified.status);
  if (!status) {
    return { status: 'pending' as const, applied: false, providerStatus: String(verified.status || 'pending') };
  }

  const amountMinor = Number(verified.amount);
  const currency = String(verified.currency || 'GHS').toUpperCase();
  if (!Number.isFinite(amountMinor) || amountMinor < 0 || currency !== 'GHS') {
    throw new Error('Paystack returned an invalid amount or currency.');
  }

  const payload = { event: status === 'success' ? 'charge.success' : 'charge.update', data: verified };
  const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const { data, error } = await serviceClient().rpc('apply_verified_paystack_webhook', {
    p_provider_event_id: String(verified.id),
    p_payload_hash: payloadHash,
    p_payment_reference: reference,
    p_provider_reference: String(verified.id),
    p_status: status,
    p_amount: amountMinor / 100,
    p_currency: currency,
    p_provider_environment: getPaystackMode(),
    p_signature: null,
    p_payload: payload,
  });

  if (error) throw new Error('The verified payment could not be applied safely.');
  return { status, applied: true, result: data };
}
