import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getPaystackMode, initializePaystackTransaction, paystackIsEnabled, permittedChannels } from '@/lib/payments/paystack.server';
import { siteConfig } from '@/lib/constants/site';
import { canInitializePaystack, parseRegistrationAccess } from '@/lib/auth/registration-access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RegistrationIntent = {
  payment_reference?: string;
  amount?: number;
  currency?: string;
  status?: string;
  payment_type?: string;
};

function signInRedirect(request: NextRequest, role: 'student' | 'vendor') {
  const next = `/payments/registration-checkout?role=${role}`;
  return NextResponse.redirect(new URL(`/signin?next=${encodeURIComponent(next)}`, request.url), 303);
}

function fallbackRedirect(request: NextRequest, role: 'student' | 'vendor') {
  const onboarding = role === 'vendor' ? '/onboarding/vendor' : '/onboarding/student';
  return NextResponse.redirect(new URL(onboarding, request.url), 303);
}

export async function GET(request: NextRequest) {
  const requestedRole = request.nextUrl.searchParams.get('role');
  const role: 'student' | 'vendor' = requestedRole === 'vendor' ? 'vendor' : 'student';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) return signInRedirect(request, role);
  const { data, error: accessError } = await supabase.rpc('get_my_registration_access');
  const access = !accessError ? parseRegistrationAccess(data) : null;
  if (!access) return NextResponse.redirect(new URL('/onboarding', request.url), 303);
  if (!canInitializePaystack(access, `${role}_registration`)) {
    const destination = access.allowed ? '/onboarding' : access.registration_path ?? '/onboarding';
    return NextResponse.redirect(new URL(destination, request.url), 303);
  }
  if (!paystackIsEnabled()) return fallbackRedirect(request, role);

  try {
    const idempotencyKey = `registration-reminder-${role}-${user.id}-${new Date().toISOString().slice(0, 10)}`;
    const { data: intent, error: intentError } = await supabase.rpc(
      role === 'vendor' ? 'resume_vendor_registration_payment' : 'resume_student_registration_payment',
      { p_idempotency_key: idempotencyKey },
    );

    if (intentError || !intent || typeof intent !== 'object') {
      return fallbackRedirect(request, role);
    }

    const payment = intent as RegistrationIntent;
    if (payment.status === 'success') {
      return NextResponse.redirect(new URL('/onboarding/complete?registration=paid', request.url), 303);
    }
    if (!payment.payment_reference || payment.currency !== 'GHS' || !Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0
        || payment.payment_type !== `${role}_registration`) {
      return fallbackRedirect(request, role);
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: saved, error: savedError } = await admin.from('payments')
      .select('status,provider_checkout_initialized_at')
      .eq('payment_reference', payment.payment_reference).eq('user_id', user.id).maybeSingle();
    if (savedError || !saved) return fallbackRedirect(request, role);
    if (saved.provider_checkout_initialized_at || saved.status !== 'initiated') {
      const callback = new URL('/payments/callback', request.url);
      callback.searchParams.set('reference', payment.payment_reference);
      return NextResponse.redirect(callback, 303);
    }
    const { data: provider, error: providerError } = await admin
      .from('payment_providers')
      .select('is_enabled,supported_methods,config')
      .eq('name', 'paystack')
      .maybeSingle();
    if (providerError || !provider?.is_enabled) return fallbackRedirect(request, role);

    const channels = permittedChannels(provider.supported_methods || [], provider.config?.channels);
    if (!channels.length) return fallbackRedirect(request, role);

    const publicUrl = (process.env.UNIECO_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url)
      .replace(/\/+$/, '').replace(/^https:\/\/uniecoghana\.com$/, siteConfig.url);
    const checkout = await initializePaystackTransaction({
      email: user.email,
      amountGhs: Number(payment.amount),
      reference: payment.payment_reference,
      callbackUrl: `${publicUrl}/payments/callback`,
      channels,
      metadata: {
        unieco_payment_reference: payment.payment_reference,
        purpose: String(payment.payment_type || `${role}_registration`),
        user_id: user.id,
      },
    });

    const { error: markError } = await admin.rpc('record_paystack_checkout_initialized', {
      p_payment_reference: payment.payment_reference,
      p_provider_environment: getPaystackMode(),
    });
    if (markError) return fallbackRedirect(request, role);

    return NextResponse.redirect(checkout.authorizationUrl, 303);
  } catch (error) {
    console.error('Registration reminder checkout failed', error instanceof Error ? error.message : 'unknown');
    return fallbackRedirect(request, role);
  }
}
