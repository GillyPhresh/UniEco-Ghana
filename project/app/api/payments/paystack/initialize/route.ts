import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getPaystackMode, initializePaystackTransaction, paystackIsEnabled, permittedChannels } from '@/lib/payments/paystack.server';

export const dynamic = 'force-dynamic';

type RequestBody = { purpose?: 'subscription' | 'marketplace'; vendorId?: string; orderId?: string; idempotencyKey?: string };

function appUrl(request: NextRequest) {
  const configured = process.env.UNIECO_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  return new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
  try {
    if (!paystackIsEnabled()) return NextResponse.json({ error: 'Paystack checkout is not enabled in this environment.' }, { status: 503 });
    const body = await request.json() as RequestBody;
    if (!body.idempotencyKey || !/^[A-Za-z0-9._=-]{8,120}$/.test(body.idempotencyKey)) return NextResponse.json({ error: 'A valid idempotency key is required.' }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
    let intent: unknown;
    let intentError: { message: string } | null = null;
    if (body.purpose === 'subscription' && body.vendorId) {
      const result = await supabase.rpc('create_subscription_payment_intent', { p_vendor_id: body.vendorId, p_provider: 'paystack', p_mobile_number: null, p_mobile_network: null, p_auto_renew: false, p_idempotency_key: body.idempotencyKey });
      intent = result.data; intentError = result.error;
    } else if (body.purpose === 'marketplace' && body.orderId) {
      const result = await supabase.rpc('create_marketplace_payment_intent', { p_order_id: body.orderId, p_provider: 'paystack', p_mobile_number: null, p_mobile_network: null, p_idempotency_key: body.idempotencyKey });
      intent = result.data; intentError = result.error;
    } else return NextResponse.json({ error: 'Unsupported payment purpose.' }, { status: 400 });
    if (intentError || !intent || typeof intent !== 'object') return NextResponse.json({ error: intentError?.message || 'Could not create payment intent.' }, { status: 422 });
    const payment = intent as { payment_reference?: string; amount?: number; currency?: string; status?: string; payment_type?: string };
    if (!payment.payment_reference || payment.currency !== 'GHS' || !Number.isFinite(Number(payment.amount))) return NextResponse.json({ error: 'Invalid authoritative payment intent.' }, { status: 422 });
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: provider, error: providerError } = await admin.from('payment_providers').select('is_enabled,supported_methods,config').eq('name', 'paystack').maybeSingle();
    if (providerError || !provider?.is_enabled) return NextResponse.json({ error: 'Paystack is not available.' }, { status: 503 });
    const channels = permittedChannels(provider.supported_methods || [], provider.config?.channels);
    if (!channels.length) return NextResponse.json({ error: 'No Paystack payment channels are currently configured for this merchant.' }, { status: 503 });
    const callbackUrl = `${appUrl(request)}/payments/callback`;
    const checkout = await initializePaystackTransaction({ email: user.email, amountGhs: Number(payment.amount), reference: payment.payment_reference, callbackUrl, channels, metadata: { unieco_payment_reference: payment.payment_reference, purpose: String(payment.payment_type || body.purpose) } });
    const { error: markError } = await admin.rpc('record_paystack_checkout_initialized', { p_payment_reference: payment.payment_reference, p_provider_environment: getPaystackMode() });
    if (markError) return NextResponse.json({ error: 'Checkout was created but could not be recorded safely. Please contact support.' }, { status: 422 });
    return NextResponse.json({ reference: checkout.reference, authorizationUrl: checkout.authorizationUrl, status: 'pending' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Paystack initialization failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Payment initialization could not be completed.' }, { status: 502 });
  }
}
