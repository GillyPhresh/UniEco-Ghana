import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient, createClient as createTokenClient } from '@supabase/supabase-js';
import { getPaystackMode, initializePaystackTransaction, paystackIsEnabled, permittedChannels } from '@/lib/payments/paystack.server';

export const dynamic = 'force-dynamic';

type RequestBody = {
  purpose?: 'subscription' | 'marketplace' | 'student_registration' | 'vendor_registration';
  vendorId?: string; orderId?: string; idempotencyKey?: string;
  registration?: { universityId?: string; phone?: string; studentIdNumber?: string; program?: string; faculty?: string; department?: string; level?: string; admissionYear?: number; graduationYear?: number | null; studentDocumentPath?: string | null; referralCode?: string | null };
};

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
    const { data: { session } } = await supabase.auth.getSession();
    const rpcClient = session?.access_token
      ? createTokenClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${session.access_token}` } },
        })
      : supabase;
    let intent: unknown;
    let intentError: { code?: string; message: string } | null = null;
    if (body.purpose === 'subscription' && body.vendorId) {
      const result = await rpcClient.rpc('create_subscription_payment_intent', { p_vendor_id: body.vendorId, p_provider: 'paystack', p_mobile_number: null, p_mobile_network: null, p_auto_renew: false, p_idempotency_key: body.idempotencyKey });
      intent = result.data; intentError = result.error;
    } else if (body.purpose === 'marketplace' && body.orderId) {
      const result = await rpcClient.rpc('create_marketplace_payment_intent', { p_order_id: body.orderId, p_provider: 'paystack', p_mobile_number: null, p_mobile_network: null, p_idempotency_key: body.idempotencyKey });
      intent = result.data; intentError = result.error;
    } else if (body.purpose === 'student_registration' && body.registration) {
      const registration = body.registration;
      const result = await rpcClient.rpc('begin_student_registration_payment', {
        p_university_id: registration.universityId,
        p_phone: registration.phone,
        p_student_id_number: registration.studentIdNumber,
        p_program: registration.program,
        p_faculty: registration.faculty,
        p_department: registration.department,
        p_level: registration.level,
        p_admission_year: registration.admissionYear,
        p_graduation_year: registration.graduationYear ?? null,
        p_student_document_path: registration.studentDocumentPath ?? null,
        p_referral_code: registration.referralCode ?? null,
        p_idempotency_key: body.idempotencyKey,
      });
      intent = result.data; intentError = result.error;
    } else if (body.purpose === 'vendor_registration' && body.vendorId) {
      const result = await rpcClient.rpc('begin_vendor_registration_payment', {
        p_vendor_id: body.vendorId,
        p_idempotency_key: body.idempotencyKey,
      });
      intent = result.data; intentError = result.error;
    } else return NextResponse.json({ error: 'Unsupported payment purpose.' }, { status: 400 });
    if (intentError) {
      console.error('Payment intent RPC rejected', { code: intentError.code || 'unknown', message: intentError.message });
      const errorMessage = intentError.code === '42501'
        ? 'Your account is not ready for registration payment. Please sign in again or contact support.'
        : intentError.code === '55000'
          ? 'This registration payment needs support review before you can continue.'
          : 'Please check your registration details and try again.';
      return NextResponse.json({ error: errorMessage }, { status: 422 });
    }
    if (!intent || typeof intent !== 'object') return NextResponse.json({ error: 'Payment could not be initialized. Please try again.' }, { status: 422 });
    const payment = intent as { payment_reference?: string; amount?: number; currency?: string; status?: string; payment_type?: string };
    if (!payment.payment_reference || payment.currency !== 'GHS' || !Number.isFinite(Number(payment.amount))) return NextResponse.json({ error: 'Invalid authoritative payment intent.' }, { status: 422 });
    if (payment.status === 'success') return NextResponse.json({ error: 'This payment is already confirmed.', reference: payment.payment_reference }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: provider, error: providerError } = await admin.from('payment_providers').select('is_enabled,supported_methods,config').eq('name', 'paystack').maybeSingle();
    if (providerError || !provider?.is_enabled) return NextResponse.json({ error: 'Paystack is not available.' }, { status: 503 });
    const channels = permittedChannels(provider.supported_methods || [], provider.config?.channels);
    if (!channels.length) return NextResponse.json({ error: 'No Paystack payment channels are currently configured for this merchant.' }, { status: 503 });
    const callbackUrl = `${appUrl(request)}/payments/callback`;
    const checkout = await initializePaystackTransaction({ email: user.email, amountGhs: Number(payment.amount), reference: payment.payment_reference, callbackUrl, channels, metadata: { unieco_payment_reference: payment.payment_reference, purpose: String(payment.payment_type || body.purpose), user_id: user.id, ...(body.registration?.universityId ? { university_id: body.registration.universityId } : {}) } });
    const { error: markError } = await admin.rpc('record_paystack_checkout_initialized', { p_payment_reference: payment.payment_reference, p_provider_environment: getPaystackMode() });
    if (markError) return NextResponse.json({ error: 'Checkout was created but could not be recorded safely. Please contact support.' }, { status: 422 });
    return NextResponse.json({ reference: checkout.reference, authorizationUrl: checkout.authorizationUrl, status: 'pending' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Paystack initialization failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Payment initialization could not be completed.' }, { status: 502 });
  }
}
