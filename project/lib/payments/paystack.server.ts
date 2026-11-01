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

export class PaystackCheckoutError extends Error {
  constructor(readonly code: 'timeout' | 'network' | 'invalid_response' | 'provider_response', message: string) {
    super(message);
    this.name = 'PaystackCheckoutError';
  }
}

const PAYSTACK_API = 'https://api.paystack.co';
const PAYSTACK_CHECKOUT_TIMEOUT_MS = 20_000;

async function postPaystack(path: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAYSTACK_CHECKOUT_TIMEOUT_MS);
  try {
    const response = await fetch(`${PAYSTACK_API}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload: { status?: boolean; message?: string; data?: Record<string, unknown> };
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      throw new PaystackCheckoutError('invalid_response', 'Paystack returned an unreadable checkout response.');
    }
    if (!response.ok || payload.status !== true || !payload.data) {
      throw new PaystackCheckoutError('provider_response', payload.message || 'Paystack could not start this checkout.');
    }
    return payload.data;
  } catch (error) {
    if (error instanceof PaystackCheckoutError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new PaystackCheckoutError('timeout', 'Paystack checkout request timed out.');
    }
    throw new PaystackCheckoutError('network', 'Paystack checkout could not be reached.');
  } finally {
    clearTimeout(timeout);
  }
}

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
  const data = await postPaystack('/transaction/initialize', {
    email: input.email,
    amount: String(Math.round(input.amountGhs * 100)),
    currency: 'GHS',
    reference: input.reference,
    callback_url: input.callbackUrl,
    channels: input.channels,
    metadata: input.metadata,
  });
  const authorizationUrl = data.authorization_url;
  const reference = data.reference;
  if (typeof authorizationUrl !== 'string' || !authorizationUrl.startsWith('https://checkout.paystack.com/') || reference !== input.reference) {
    throw new PaystackCheckoutError('invalid_response', 'Paystack returned an invalid checkout link or reference.');
  }
  return { authorizationUrl, reference };
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
  const data = await postPaystack('/charge', {
    email: input.email,
    amount: String(Math.round(input.amountGhs * 100)),
    currency: 'GHS',
    reference: input.reference,
    mobile_money: { phone: input.phone, provider: input.provider },
    metadata: input.metadata,
  });
  const reference = data.reference;
  if (typeof reference !== 'string' || reference !== input.reference) {
    throw new PaystackCheckoutError('invalid_response', 'Paystack returned an unexpected Mobile Money reference.');
  }
  return {
    reference,
    status: typeof data.status === 'string' ? data.status : 'pending',
    displayText: typeof data.display_text === 'string' ? data.display_text : 'Approve the Mobile Money prompt on your phone to complete payment.',
    providerReference: typeof data.id === 'string' || typeof data.id === 'number' ? String(data.id) : null,
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
