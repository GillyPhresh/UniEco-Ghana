import 'server-only';

export type PaystackMode = 'test' | 'live';
export type PaystackChannel = 'card' | 'mobile_money' | 'bank_transfer';
export type PaystackMobileMoneyProvider = 'mtn' | 'atl' | 'vod';

export type PaystackVerificationErrorCode = 'configuration' | 'timeout' | 'network' | 'provider_response' | 'not_found' | 'invalid_response';

export class PaystackVerificationError extends Error {
  constructor(readonly code: PaystackVerificationErrorCode, message: string) {
    super(message);
    this.name = 'PaystackVerificationError';
  }
}

const PAYSTACK_API = 'https://api.paystack.co';

export function getPaystackMode(): PaystackMode {
  return process.env.PAYSTACK_MODE === 'live' ? 'live' : 'test';
}

/** Infer the key's provider environment for legacy payments without a stored mode. */
export function getPaystackCredentialMode(): PaystackMode {
  const key = process.env.PAYSTACK_SECRET_KEY || '';
  if (key.startsWith('sk_live_')) return 'live';
  if (key.startsWith('sk_test_')) return 'test';
  return getPaystackMode();
}

export function paystackIsEnabled(): boolean {
  const mode = getPaystackMode();
  if (process.env.PAYSTACK_ENABLED !== 'true') return false;
  const key = process.env.PAYSTACK_SECRET_KEY || '';
  if (mode === 'test') return process.env.UNIECO_ENV !== 'production' && key.startsWith('sk_test_');
  // Live charges are forbidden outside production, even if a staging shell
  // accidentally inherits live provider configuration.
  return process.env.UNIECO_ENV === 'production'
    && process.env.PAYSTACK_LIVE_ENABLED === 'true'
    && key.startsWith('sk_live_');
}

function secret(): string {
  if (!paystackIsEnabled()) throw new Error('Paystack is not enabled for this environment');
  return process.env.PAYSTACK_SECRET_KEY as string;
}

export function permittedChannels(methods: string[], configuredChannels: unknown): PaystackChannel[] {
  const fromConfig = Array.isArray(configuredChannels) ? configuredChannels : [];
  const requested = fromConfig.filter((channel): channel is PaystackChannel => ['card', 'mobile_money', 'bank_transfer'].includes(String(channel)));
  // Merchant-configured channels are authoritative. The legacy method list is
  // only used to ensure the selected channel has a matching enabled method.
  return requested.filter(channel => channel === 'card'
    ? methods.some(method => ['visa', 'mastercard', 'card'].includes(method))
    : channel === 'mobile_money'
      ? methods.some(method => ['mtn_momo', 'airteltigo_money', 'vodafone_cash'].includes(method))
      : methods.includes('bank_transfer'));
}

export async function initializePaystackTransaction(input: {
  email: string;
  amountGhs: number;
  reference: string;
  callbackUrl: string;
  channels: PaystackChannel[];
  metadata: Record<string, string>;
}) {
  const response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email,
      amount: String(Math.round(input.amountGhs * 100)),
      currency: 'GHS',
      reference: input.reference,
      callback_url: input.callbackUrl,
      channels: input.channels,
      metadata: input.metadata,
    }),
    cache: 'no-store',
  });
  const payload = await response.json() as { status?: boolean; message?: string; data?: { authorization_url?: string; reference?: string } };
  if (!response.ok || !payload.status || !payload.data?.authorization_url || payload.data.reference !== input.reference) {
    throw new Error(payload.message || 'Paystack could not initialize this payment');
  }
  return { authorizationUrl: payload.data.authorization_url, reference: payload.data.reference };
}

/**
 * Starts Paystack's native Ghana MoMo charge flow. This avoids relying on the
 * hosted checkout's mobile Safari UI, which can fail before it returns a
 * useful provider response. The final payment state still comes only from
 * the verified Paystack webhook.
 */
export async function chargePaystackMobileMoney(input: {
  email: string;
  amountGhs: number;
  reference: string;
  phone: string;
  provider: PaystackMobileMoneyProvider;
  metadata: Record<string, string>;
}) {
  const response = await fetch(`${PAYSTACK_API}/charge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email,
      amount: String(Math.round(input.amountGhs * 100)),
      currency: 'GHS',
      reference: input.reference,
      mobile_money: { phone: input.phone, provider: input.provider },
      metadata: input.metadata,
    }),
    cache: 'no-store',
  });
  const payload = await response.json() as {
    status?: boolean;
    message?: string;
    data?: { reference?: string; status?: string; display_text?: string; id?: string | number };
  };
  if (!response.ok || !payload.status || !payload.data?.reference || payload.data.reference !== input.reference) {
    throw new Error(payload.message || 'Paystack could not start the Mobile Money prompt');
  }
  return {
    reference: payload.data.reference,
    status: payload.data.status || 'pending',
    displayText: payload.data.display_text || 'Approve the Mobile Money prompt on your phone to complete payment.',
    providerReference: payload.data.id ? String(payload.data.id) : null,
  };
}

function verificationSecret(expectedMode: PaystackMode): string {
  const key = process.env.PAYSTACK_SECRET_KEY || '';
  const prefix = expectedMode === 'live' ? 'sk_live_' : 'sk_test_';
  if (!key.startsWith(prefix)) {
    throw new PaystackVerificationError('configuration', `A Paystack ${expectedMode} secret key is not configured for verification.`);
  }
  // Live credentials may only be used by the production app. Verification is
  // intentionally independent of checkout enablement so an existing charge
  // can still be reconciled after new checkout has been paused.
  if (expectedMode === 'live' && process.env.UNIECO_ENV !== 'production') {
    throw new PaystackVerificationError('configuration', 'Live Paystack verification is only allowed in production.');
  }
  if (expectedMode === 'test' && process.env.UNIECO_ENV === 'production') {
    throw new PaystackVerificationError('configuration', 'Test Paystack verification cannot grant production payment access.');
  }
  return key;
}

export async function verifyPaystackTransaction(reference: string, expectedMode: PaystackMode = getPaystackCredentialMode()) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${verificationSecret(expectedMode)}` }, cache: 'no-store', signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof PaystackVerificationError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new PaystackVerificationError('timeout', 'Paystack verification timed out.');
    throw new PaystackVerificationError('network', 'Paystack could not be reached for verification.');
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  let payload: { status?: boolean; message?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(responseText) as typeof payload;
  } catch {
    throw new PaystackVerificationError('invalid_response', 'Paystack returned a response that could not be verified.');
  }
  if (!response.ok || !payload.status || !payload.data) {
    if (expectedMode === 'live' && /not found|does not exist/i.test(String(payload.message || ''))) {
      throw new PaystackVerificationError('not_found', 'No live Paystack transaction matches this reference.');
    }
    throw new PaystackVerificationError('provider_response', 'Paystack could not verify this transaction reference.');
  }
  return payload.data;
}
