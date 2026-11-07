import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient, createClient as createTokenClient } from '@supabase/supabase-js';
import { chargePaystackMobileMoney, getPaystackMode, initializePaystackTransaction, paystackIsEnabled, PaystackCheckoutError, permittedChannels, type PaystackMobileMoneyProvider } from '@/lib/payments/paystack.server';
import { reconcilePaystackPayment } from '@/lib/payments/paystack-reconciliation.server';
import { siteConfig } from '@/lib/constants/site';
import { readJsonLimited, RequestBodyTooLargeError } from '@/lib/http/read-json-limited';

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
    const body = await readJsonLimited<RequestBody>(request, 32 * 1024);
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
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    let studentRegistration = body.registration;
    if (body.purpose === 'student_registration' && studentRegistration && !studentRegistration.referralCode) {
      // A referral is part of the original registration record. On a resume,
      // the browser may no longer have the invite URL/session value; omitting
      // it must not make a valid saved registration look like a changed one.
      const { data: savedReferralCode, error: savedRegistrationError } = await rpcClient
        .rpc('get_my_student_registration_referral_code');
      if (savedRegistrationError) {
        console.error('[registration-payment-resume] saved registration lookup failed', { code: savedRegistrationError.code || 'unknown' });
        return NextResponse.json({ error: 'We could not load your saved registration yet. Your details are safe; please retry shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
      }
      if (typeof savedReferralCode === 'string' && savedReferralCode) {
        studentRegistration = { ...studentRegistration, referralCode: savedReferralCode };
      }
    }

    if (body.purpose === 'student_registration' && studentRegistration) {
      // A previous request can reach Paystack and then time out before UniEco
      // records the checkout timestamp. Reconcile older initiated references
      // before the registration RPC reuses one; only a verified not-found on
      // an intent with no recorded checkout is safe to reuse as-is.
      const { data: previousStudentPayment, error: previousStudentPaymentError } = await admin
        .from('payments')
        .select('payment_reference,status,provider_checkout_initialized_at')
        .eq('user_id', user.id)
        .eq('payment_type', 'student_registration')
        .eq('provider', 'paystack')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousStudentPaymentError) {
        console.error('[student-registration-payment-resume] lookup failed', { code: previousStudentPaymentError.code || 'unknown' });
        return NextResponse.json({ error: 'We could not safely check your earlier payment. No new payment was started; please retry shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
      }

      if (previousStudentPayment?.status === 'initiated') {
        let recovery: Awaited<ReturnType<typeof reconcilePaystackPayment>> | null = null;
        let safeToReuseUninitializedReference = false;
        try {
          recovery = await reconcilePaystackPayment(previousStudentPayment.payment_reference);
        } catch (error) {
          const code = error instanceof Error && 'code' in error ? String(error.code) : 'verification_unavailable';
          if (code === 'not_found' && !previousStudentPayment.provider_checkout_initialized_at) {
            safeToReuseUninitializedReference = true;
          } else {
            console.error('[student-registration-payment-resume] verification failed', { code });
            return NextResponse.json({
              error: code === 'not_found'
                ? 'Paystack could not find the earlier checkout, so we did not start another charge. Please contact support to check this payment safely.'
                : 'We could not verify your earlier payment with Paystack. No new payment was started; please retry shortly.',
            }, { status: code === 'not_found' ? 409 : 503, headers: { 'Cache-Control': 'no-store' } });
          }
        }

        if (!safeToReuseUninitializedReference && recovery) {
          if (recovery.status === 'success') {
            return NextResponse.json({ reference: previousStudentPayment.payment_reference, status: 'success', alreadyPaid: true }, { headers: { 'Cache-Control': 'no-store' } });
          }
          if (recovery.status === 'pending') {
            return NextResponse.json({ error: 'Your earlier Paystack payment is still processing. Please wait for its result before trying again; we will not create a second charge.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
          }
          if (recovery.status === 'reconciliation_required' || !recovery.applied || !['failed', 'cancelled'].includes(recovery.status)) {
            return NextResponse.json({ error: recovery.message || 'Your earlier payment needs a support check. No new charge was started.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
          }
          // A verified failed/cancelled result is now recorded. The RPC below
          // will create the next distinct reference while preserving the form.
        }
      }
    }

    if (body.purpose === 'vendor_registration' && body.vendorId) {
      // Vendor onboarding may already have created the vendor row before a
      // previous checkout request timed out. Reconcile that exact reference
      // before allowing the database to issue or initialize another attempt.
      const { data: previousVendorPayment, error: previousVendorPaymentError } = await admin
        .from('payments')
        .select('payment_reference,status,provider_checkout_initialized_at,amount,currency')
        .eq('user_id', user.id)
        .eq('vendor_id', body.vendorId)
        .eq('payment_type', 'vendor_registration')
        .eq('provider', 'paystack')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousVendorPaymentError) {
        console.error('[vendor-registration-payment-resume] lookup failed', { code: previousVendorPaymentError.code || 'unknown' });
        return NextResponse.json({ error: 'We could not safely check your earlier payment. No new payment was started; please retry shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
      }

      if (previousVendorPayment?.status === 'reconciliation_required') {
        return NextResponse.json({ error: 'Your earlier vendor registration payment needs a support check. No new payment was started.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
      }

      if (previousVendorPayment && ['initiated', 'pending'].includes(previousVendorPayment.status)) {
        let recovery: Awaited<ReturnType<typeof reconcilePaystackPayment>>;
        let safeToReuseUninitializedReference = false;
        try {
          recovery = await reconcilePaystackPayment(previousVendorPayment.payment_reference);
        } catch (error) {
          const code = error instanceof Error && 'code' in error ? String(error.code) : 'verification_unavailable';
          // No provider checkout was recorded for an initiated intent. A
          // not-found result is safe to retry on that same reference; never
          // mint a new reference while a previously opened checkout is unclear.
          if (!(code === 'not_found' && previousVendorPayment.status === 'initiated' && !previousVendorPayment.provider_checkout_initialized_at)) {
            console.error('[vendor-registration-payment-resume] verification failed', { code });
            return NextResponse.json({
              error: code === 'not_found'
                ? 'We could not find the earlier vendor checkout in Paystack. No new charge was started; please contact support so we can check it safely.'
                : 'We could not verify your earlier vendor payment. No new charge was started; please retry shortly.',
            }, { status: code === 'not_found' ? 409 : 503, headers: { 'Cache-Control': 'no-store' } });
          }
          safeToReuseUninitializedReference = true;
          recovery = { status: 'pending', applied: false, providerStatus: 'not_found' };
        }

        if (recovery.status === 'pending') {
          // Only a provider-confirmed not-found result for an uninitialized
          // intent can be retried on the existing reference.
          if (!safeToReuseUninitializedReference) {
            return NextResponse.json({ error: 'Your earlier Paystack payment is still processing. Complete or approve it first; we will not start a second charge.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
          }
        } else if (recovery.status === 'success') {
          // The intent RPC below will return this verified payment and repair
          // its vendor registration state using the database trigger.
        } else if (recovery.status === 'reconciliation_required') {
          return NextResponse.json({ error: recovery.message || 'Your earlier vendor payment needs a support review. No new payment was started.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
        } else if (!recovery.applied || !['failed', 'cancelled'].includes(recovery.status)) {
          return NextResponse.json({ error: 'Your earlier vendor payment is not safely resolved yet. No new payment was started; please retry shortly.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
        }
      }
    }

    let intent: unknown;
    let intentError: { code?: string; message: string } | null = null;
    if (body.purpose === 'subscription' && body.vendorId) {
      const result = await rpcClient.rpc('create_subscription_payment_intent', { p_vendor_id: body.vendorId, p_provider: 'paystack', p_mobile_number: null, p_mobile_network: null, p_auto_renew: body.autoRenew === true, p_idempotency_key: body.idempotencyKey });
      intent = result.data; intentError = result.error;
    } else if (body.purpose === 'marketplace' && body.orderId) {
      const result = await rpcClient.rpc('create_marketplace_payment_intent', { p_order_id: body.orderId, p_provider: 'paystack', p_mobile_number: null, p_mobile_network: null, p_idempotency_key: body.idempotencyKey });
      intent = result.data; intentError = result.error;
    } else if (body.purpose === 'student_registration' && studentRegistration) {
      const registration = studentRegistration;
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
      if (supportReview && body.purpose === 'student_registration' && studentRegistration) {
        const { data: quarantined, error: lookupError } = await admin
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
            const { data: refreshed, error: refreshError } = await admin
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
            const registration = studentRegistration;
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
        : (intentError.code === '42883' || intentError.code === 'PGRST202')
          && /gen_random_bytes|begin_student_registration_payment/i.test(intentError.message)
          ? 'The registration payment service is being updated. Your saved details are safe; please try again shortly. If this continues, contact support.'
        : supportReview
          ? 'This registration payment needs support review before you can continue.'
          : 'Payment setup failed before Paystack could open. Please try again or contact support.';
      const unavailable = (intentError.code === '42883' || intentError.code === 'PGRST202')
        && /gen_random_bytes|begin_student_registration_payment/i.test(intentError.message);
      return NextResponse.json({ error: errorMessage }, { status: unavailable ? 503 : 422, headers: { 'Cache-Control': 'no-store' } });
      }
    }
    if (!intent || typeof intent !== 'object') return NextResponse.json({ error: 'Payment could not be initialized. Please try again.' }, { status: 422 });
    let payment = intent as { payment_reference?: string; amount?: number; currency?: string; status?: string; payment_type?: string };
    if (!payment.payment_reference || payment.currency !== 'GHS' || !Number.isFinite(Number(payment.amount))) return NextResponse.json({ error: 'Invalid authoritative payment intent.' }, { status: 422 });
    // A prior checkout is returned as the latest intent by the registration
    // RPC. Paystack references are single-use, so verify that attempt before
    // trying to initialize anything again. Only a provider-confirmed terminal
    // failure/abandonment may create a fresh reference; pending or unverifiable
    // attempts are never duplicated.
    if (body.purpose === 'student_registration' && studentRegistration && payment.status === 'pending') {
      const { data: priorPayment, error: priorPaymentError } = await admin
        .from('payments')
        .select('provider_checkout_initialized_at,status')
        .eq('payment_reference', payment.payment_reference)
        .eq('user_id', user.id)
        .eq('provider', 'paystack')
        .maybeSingle();
      if (priorPaymentError || !priorPayment) {
        console.error('[registration-payment-resume] prior payment lookup failed', { code: priorPaymentError?.code || 'not_found' });
        return NextResponse.json({ error: 'We could not safely check your earlier payment. No new charge was started; please retry shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
      }
      if (priorPayment.status === 'success') {
        return NextResponse.json({ reference: payment.payment_reference, status: 'success', alreadyPaid: true }, { headers: { 'Cache-Control': 'no-store' } });
      }
      // Verify even legacy pending rows without the checkout timestamp: they
      // may still have been initialized before that metadata was introduced.
      if (priorPayment.provider_checkout_initialized_at || priorPayment.status === 'pending') {
        let recovery: Awaited<ReturnType<typeof reconcilePaystackPayment>>;
        try {
          recovery = await reconcilePaystackPayment(payment.payment_reference);
        } catch (error) {
          const code = error instanceof Error && 'code' in error ? String(error.code) : 'verification_unavailable';
          console.error('[registration-payment-resume] prior checkout verification failed', { code });
          return NextResponse.json({
            error: code === 'not_found'
              ? 'Paystack could not find a confirmed result for your earlier checkout. No new charge was started; please contact support so we can safely check it.'
              : 'We could not verify your earlier payment with Paystack. No new charge was started; please retry shortly.',
          }, { status: code === 'not_found' ? 409 : 503, headers: { 'Cache-Control': 'no-store' } });
        }
        if (recovery.status === 'success') {
          return NextResponse.json({ reference: payment.payment_reference, status: 'success', alreadyPaid: true }, { headers: { 'Cache-Control': 'no-store' } });
        }
        if (recovery.status === 'pending') {
          return NextResponse.json({ error: 'Your earlier Paystack payment is still processing. Please wait for its result before trying again; we will not create a second charge.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
        }
        if (recovery.status === 'reconciliation_required' || !recovery.applied || !['failed', 'cancelled'].includes(recovery.status)) {
          return NextResponse.json({ error: recovery.message || 'Your earlier payment needs a support check. No new charge was started.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
        }

        const retry = await rpcClient.rpc('begin_student_registration_payment', {
          p_university_id: studentRegistration.universityId,
          p_phone: studentRegistration.phone,
          p_student_id_number: studentRegistration.studentIdNumber,
          p_program: studentRegistration.program,
          p_faculty: studentRegistration.faculty,
          p_department: studentRegistration.department,
          p_level: studentRegistration.level,
          p_admission_year: studentRegistration.admissionYear,
          p_graduation_year: studentRegistration.graduationYear ?? null,
          p_student_document_path: studentRegistration.studentDocumentPath ?? null,
          p_referral_code: studentRegistration.referralCode ?? null,
          p_idempotency_key: body.idempotencyKey,
        });
        if (retry.error || !retry.data || typeof retry.data !== 'object') {
          console.error('[registration-payment-resume] fresh intent creation failed', { code: retry.error?.code || 'unknown' });
          return NextResponse.json({ error: 'Your earlier payment is confirmed as incomplete, but a new checkout could not be prepared yet. Your saved details are safe; please retry shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
        }
        payment = retry.data as typeof payment;
        if (!payment.payment_reference || payment.currency !== 'GHS' || !Number.isFinite(Number(payment.amount))) {
          return NextResponse.json({ error: 'A new payment could not be prepared safely. Please retry shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
        }
      }
    }
    if (payment.status === 'success') {
      if (payment.payment_type === 'student_registration' || payment.payment_type === 'vendor_registration') {
        return NextResponse.json({ reference: payment.payment_reference, status: 'success', alreadyPaid: true }, { headers: { 'Cache-Control': 'no-store' } });
      }
      return NextResponse.json({ error: 'This payment is already confirmed.', reference: payment.payment_reference }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
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
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof PaystackCheckoutError) {
      console.error('[paystack-initialize] provider checkout request failed', { code: error.code });
      return NextResponse.json({
        error: error.code === 'timeout'
          ? 'Paystack is taking longer than expected. Your payment reference will be checked before another attempt; please retry shortly.'
          : 'Paystack could not start checkout right now. Your registration details are saved; please retry shortly.',
      }, { status: error.code === 'timeout' ? 504 : 502, headers: { 'Cache-Control': 'no-store' } });
    }
    console.error('Paystack initialization failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Payment initialization could not be completed.' }, { status: 502 });
  }
}
