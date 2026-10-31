import 'server-only';

import { createHash } from 'node:crypto';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getPaystackCredentialMode, type PaystackMode, verifyPaystackTransaction } from '@/lib/payments/paystack.server';

const PAYMENT_REFERENCE_PATTERN = /^[A-Za-z0-9._=-]{8,120}$/;

type PaystackVerification = Record<string, unknown> & {
  reference?: string;
  id?: string | number;
  status?: string;
  amount?: number | string;
  currency?: string;
};

export class PaystackReconciliationApplyError extends Error {
  constructor(readonly code: string) {
    super('Verified Paystack result could not be safely applied to the UniEco payment record.');
    this.name = 'PaystackReconciliationApplyError';
  }
}

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
  const client = serviceClient();
  const { data: payment, error: paymentLookupError } = await client
    .from('payments')
    .select('payment_reference,provider,payment_type,provider_environment')
    .eq('payment_reference', reference)
    .maybeSingle();
  if (paymentLookupError) throw new Error('Payment record could not be loaded for verification.');
  if (!payment || payment.provider !== 'paystack') throw new Error('No matching Paystack payment was found.');

  // Outside production, verify against the environment recorded on this exact
  // payment, not a mutable global PAYSTACK_MODE. Production always verifies
  // against Paystack Live: a stored test marker cannot grant production access.
  // If Live confirms the exact reference, amount and currency, the protected
  // environment-binding RPC may repair the legacy marker. Test-only references
  // are not found in Live and remain unpaid.
  const environment: PaystackMode = process.env.UNIECO_ENV === 'production'
    ? 'live'
    : payment.provider_environment === 'live' || payment.provider_environment === 'test'
      ? payment.provider_environment
      : getPaystackCredentialMode();
  const verified = await verifyPaystackTransaction(reference, environment) as PaystackVerification;
  if (String(verified.reference || '') !== reference || verified.id === undefined || verified.id === null) {
    throw new Error('Paystack returned an unexpected payment reference.');
  }

  const amountMinor = Number(verified.amount);
  const currency = String(verified.currency || 'GHS').toUpperCase();
  if (!Number.isFinite(amountMinor) || amountMinor <= 0 || currency !== 'GHS') {
    throw new Error('Paystack returned an invalid amount or currency.');
  }

  const status = statusFromPaystack(verified.status);

  // A manual verification is a separate, audited reconciliation event. Include
  // its unique ID in the payload hash: payment_webhook_events also has a unique
  // (provider, payload_hash) constraint, so hashing only the provider response
  // can collide with the original webhook and abort this retry.
  const retryEventId = `manual-reconcile-${String(verified.id)}-${Date.now()}`;
  const payload = {
    event: status === 'success' ? 'charge.success' : 'charge.update',
    data: verified,
    reconciliation: { source: 'admin_manual_verification', event_id: retryEventId },
  };
  const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const { error: environmentError } = await client.rpc('bind_legacy_paystack_environment', {
    p_payment_reference: reference,
    p_provider_environment: environment,
    p_amount: amountMinor / 100,
    p_currency: currency,
  });
  if (environmentError?.code === '22023') {
    return {
      status: 'reconciliation_required' as const,
      applied: false,
      message: 'Paystack verified this reference, but its amount, currency, or environment does not match the UniEco payment record. The payment was not marked as paid.',
    };
  }
  if (environmentError) {
    console.error('[paystack-reconciliation] environment binding rejected', { code: environmentError.code || 'unknown' });
    throw new PaystackReconciliationApplyError(environmentError.code || 'environment_binding');
  }

  if (!status) {
    return { status: 'pending' as const, applied: false, providerStatus: String(verified.status || 'pending') };
  }

  // A previous webhook may already have recorded the provider event as
  // reconciliation_required. The retry event has its own event ID and payload
  // hash, while the verified Paystack data remains unchanged inside `data`.
  const { data, error } = await client.rpc('apply_verified_paystack_webhook', {
    p_provider_event_id: retryEventId,
    p_payload_hash: payloadHash,
    p_payment_reference: reference,
    p_provider_reference: String(verified.id),
    p_status: status,
    p_amount: amountMinor / 100,
    p_currency: currency,
    p_provider_environment: environment,
    p_signature: null,
    p_payload: payload,
  });

  if (error) {
    console.error('[paystack-reconciliation] verified result rejected by database', { code: error.code || 'unknown' });
    throw new PaystackReconciliationApplyError(error.code || 'database_apply');
  }

  const result = data as { reconciliation_required?: boolean; ignored?: boolean; idempotent?: boolean; status?: string } | null;
  if (result?.reconciliation_required) {
    return {
      status: 'reconciliation_required' as const,
      applied: false,
      message: 'Paystack verified this reference, but its amount, currency, or environment does not match the UniEco payment record. The payment was not marked as paid.',
      result,
    };
  }
  if (result?.ignored) {
    return {
      status: 'reconciliation_required' as const,
      applied: false,
      message: 'Paystack verified this reference, but UniEco could not safely match it to a payment record. No payment status was changed.',
      result,
    };
  }
  return { status, applied: true, result };
}
