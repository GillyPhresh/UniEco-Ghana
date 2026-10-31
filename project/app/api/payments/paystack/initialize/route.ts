import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient, createClient as createTokenClient } from '@supabase/supabase-js';
import { chargePaystackMobileMoney, getPaystackMode, initializePaystackTransaction, paystackIsEnabled, permittedChannels, type PaystackMobileMoneyProvider } from '@/lib/payments/paystack.server';
import { reconcilePaystackPayment } from '@/lib/payments/paystack-reconciliation.server';
import { siteConfig } from '@/lib/constants/site';

export const dynamic = 'force-dynamic';

type RequestBody = {
  purpose?: 'subscription' | 'marketplace' | 'student_registration' | 'vendor_registration';
  vendorId?: string; orderId?: string; idempotencyKey?: string;
  autoRenew?: boolean;
  mobileMoney?: { phone?: string; provider?: PaystackMobileMoneyProvider };
  registration?: { universityId?: string; phone?: string; studentIdNumber?: string; program?: string; faculty?: string; department?: string; level?: string; admissionYear?: number; graduationYear?: number | null; studentDocumentPath?: string | null; referralCode?: string | null };
};

function appUrl() {
  const configured = process.env.UNIECO_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return configured.replace(/\/+$/, '').replace(/^https:\/\/uniecoghana\.com$/, siteConfig.url);
  }
  return siteConfig.url;
}

function normalizeGhanaPhone(value: string | undefined): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  const local = digits.startsWith('233') ? `0${digits.slice(3)}` : digits.length === 9 && digits.startsWith('2') ? `0${digits}` : digits;
  return /^0\d{9}$/.test(local) ? local : null;
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
      const result = await rpcClient.rpc('create_subscription_payment_intent', { p_vendor_id: body.vendorId, p_provider: 'paystack', p_mobile_number: null, p_mobile_network: null, p_auto_renew: body.autoRenew === true, p_idempotency_key: body.idempotencyKey });
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
      const supportReview = intentError.code === '55000'
        || (intentError.code === '22023' && /support review|already locked|already complete/i.test(intentError.message));

      // A previous Paystack success can be quarantined after legacy test/live
      // metadata drift. Verify that exact user's quarantined registration
      // payment before asking the database to create another intent. Never
      // create a second charge while the provider still reports pending.
      if (supportReview && body.purpose === 'student_registration' && body.registration) {
        const recoveryAdmin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data: quarantined, error: lookupError } = await recoveryAdmin
          .from('payments')
          .select('payment_reference,status')
          .eq('user_id', user.id)
          .eq('payment_type', 'student_registration')
          .in('status', ['success', 'reconciliation_required'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lookupError) {
          console.error('[registration-payment-recovery] lookup failed', { code: lookupError.code || 'unknown' });
          return NextResponse.json({ error: 'We could not check your earlier payment yet. No new payment was started. Please retry shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
        }

        if (quarantined?.payment_reference) {
          if (quarantined.status === 'success') {
            return NextResponse.json({ reference: quarantined.payment_reference, status: 'success', alreadyPaid: true }, { headers: { 'Cache-Control': 'no-store' } });
          }

          let recovery: Awaited<ReturnType<typeof reconcilePaystackPayment>>;
          try {
            recovery = await reconcilePaystackPayment(quarantined.payment_reference);
          } catch (error) {
            const code = error instanceof Error && 'code' in error ? String(error.code) : 'verification_unavailable';
            console.error('[registration-payment-recovery] verification failed', { code });
            return NextResponse.json({
              error: 'We could not confirm your earlier payment with Paystack. No new payment was started. If you see a debit, do not pay again; retry this check shortly.',
            }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
          }

          if (recovery.status === 'success') {
            const { data: refreshed, error: refreshError } = await recoveryAdmin
              .from('payments')
              .select('payment_reference,status')
              .eq('user_id', user.id)
              .eq('payment_reference', quarantined.payment_reference)
              .maybeSingle();
            if (!refreshError && refreshed?.status === 'success') {
              return NextResponse.json({ reference: refreshed.payment_reference, status: 'success', alreadyPaid: true }, { headers: { 'Cache-Control': 'no-store' } });
            }
            return NextResponse.json({ error: 'Paystack confirmed the charge, but UniEco is still applying the verified result. No new payment was started; please retry shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
          }

          if (recovery.status === 'pending') {
            return NextResponse.json({ error: 'Paystack still shows your earlier payment as pending. Finish or approve it if Paystack is waiting for an action, then retry. We will not start a second charge while this one is unresolved.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
          }

          if (recovery.status === 'reconciliation_required') {
            return NextResponse.json({ error: recovery.message || 'Paystack and UniEco payment details still need a support review. No new payment was started.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
          }

          if (recovery.applied && ['failed', 'cancelled'].includes(recovery.status)) {
            const registration = body.registration;
            const retry = await rpcClient.rpc('begin_student_registration_payment', {
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
            intent = retry.data;
            intentError = retry.error;
          }
        }
      }

      if (!intentError) {
        // A verified failed/cancelled attempt has been safely replaced with a
        // fresh intent. Continue through the normal Paystack initialization.
      } else {
      const errorMessage = intentError.code === '42501'
        ? 'Your account is not ready for registration payment. Please sign in again or contact support.'
        : supportReview
          ? 'This registration payment needs support review before you can continue.'
          : 'Payment setup failed before Paystack could open. Please try again or contact support.';
      return NextResponse.json({ error: errorMessage }, { status: 422 });
      }
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
    const metadata = { unieco_payment_reference: payment.payment_reference, purpose: String(payment.payment_type || body.purpose), user_id: user.id, ...(body.registration?.universityId ? { university_id: body.registration.universityId } : {}) };

    if (body.mobileMoney) {
      if (!channels.includes('mobile_money')) return NextResponse.json({ error: 'Mobile Money is not currently enabled for this merchant.' }, { status: 503 });
      const phone = normalizeGhanaPhone(body.mobileMoney.phone);
      const providerCode = body.mobileMoney.provider;
      if (!phone || !providerCode || !['mtn', 'atl', 'vod'].includes(providerCode)) {
        return NextResponse.json({ error: 'Enter a valid Ghana Mobile Money number and select MTN, Telecel, or AirtelTigo.' }, { status: 400 });
      }
      const charge = await chargePaystackMobileMoney({ email: user.email, amountGhs: Number(payment.amount), reference: payment.payment_reference, phone, provider: providerCode, metadata });
      const { error: markError } = await admin.rpc('record_paystack_checkout_initialized', { p_payment_reference: payment.payment_reference, p_provider_environment: getPaystackMode() });
      if (markError) return NextResponse.json({ error: 'The Mobile Money prompt was created but could not be recorded safely. Please contact support.' }, { status: 422 });
      return NextResponse.json({ reference: charge.reference, status: 'pending', mobileMoney: { status: charge.status, displayText: charge.displayText } }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const callbackUrl = `${appUrl()}/payments/callback`;
    const checkout = await initializePaystackTransaction({ email: user.email, amountGhs: Number(payment.amount), reference: payment.payment_reference, callbackUrl, channels, metadata });
    const { error: markError } = await admin.rpc('record_paystack_checkout_initialized', { p_payment_reference: payment.payment_reference, p_provider_environment: getPaystackMode() });
    if (markError) return NextResponse.json({ error: 'Checkout was created but could not be recorded safely. Please contact support.' }, { status: 422 });
    return NextResponse.json({ reference: checkout.reference, authorizationUrl: checkout.authorizationUrl, status: 'pending' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Paystack initialization failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Payment initialization could not be completed.' }, { status: 502 });
  }
}
