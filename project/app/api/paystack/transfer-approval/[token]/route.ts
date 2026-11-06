import { timingSafeEqual, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const response = (status: number) => new NextResponse('{}', { status, headers: { ...headers, 'Content-Type': 'application/json' } });
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function validToken(actual: string, expected: string) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(expected) || actual.length !== expected.length) return false;
  const actualHash = createHash('sha256').update(actual).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const expectedToken = process.env.PAYSTACK_TRANSFER_APPROVAL_TOKEN || '';
  if (!validToken(token, expectedToken)) return response(400);

  // Fail closed outside the explicitly configured production/live environment.
  if (process.env.UNIECO_ENV !== 'production' || process.env.PAYSTACK_MODE !== 'live'
    || process.env.PAYSTACK_LIVE_ENABLED !== 'true' || process.env.UNIECO_REFERRAL_PAYOUTS_ENABLED !== 'true'
    || !process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live_')) return response(400);

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > 16_384) return response(400);
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) return response(400);

  let body: unknown;
  try {
    const raw = await request.text();
    if (!raw || Buffer.byteLength(raw, 'utf8') > 16_384) return response(400);
    body = JSON.parse(raw);
  } catch {
    return response(400);
  }
  if (!record(body)) return response(400);

  const reference = body.reference;
  const amount = body.amount;
  const currency = body.currency;
  const recipient = body.recipient;
  if (typeof reference !== 'string' || !/^[a-z0-9_-]{16,50}$/.test(reference)
    || typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000
    || currency !== 'GHS' || body.source !== 'balance'
    || typeof recipient !== 'string' || !/^RCP_[A-Za-z0-9]+$/.test(recipient)
    || body.reason !== 'UniEco Ghana referral reward'
    || (body.domain !== undefined && body.domain !== 'live')) return response(400);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return response(400);

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(1800) }) },
    });
    const { data, error } = await supabase.rpc('is_referral_payout_approval_valid', {
      p_reference: reference,
      p_amount_pesewas: amount,
      p_currency: currency,
      p_recipient_code: recipient,
    });
    if (error || data !== true) return response(400);
    return response(200);
  } catch {
    // Paystack requires a prompt decision; dependency failures are a rejection.
    return response(400);
  }
}
