import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getPaystackMode, initializePaystackTransaction, paystackIsEnabled, permittedChannels } from '@/lib/payments/paystack.server';
import { reconcilePaystackPayment } from '@/lib/payments/paystack-reconciliation.server';
import { readHostedRegistrationCheckout, registrationCheckoutOrigin, saveHostedRegistrationCheckout } from '@/lib/payments/registration-checkout.server';
import { parseRegistrationAccess, registrationReminderRole } from '@/lib/auth/registration-access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };

export function HEAD() {
  return new NextResponse(null, { status: 204, headers });
}

export async function GET(request: NextRequest) {
  if (request.headers.has('next-router-prefetch')
      || /prefetch|prerender/i.test(`${request.headers.get('purpose') ?? ''} ${request.headers.get('sec-purpose') ?? ''}`)) {
    return HEAD();
  }

  const redirect = (path: string) => NextResponse.redirect(new URL(path, registrationCheckoutOrigin(request.url)), { status: 303, headers });
  const status = (state: 'unavailable' | 'no-fee' | 'details' | 'check' | 'paid') => redirect(`/payments/registration-status?state=${state}`);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return redirect('/signin?next=%2Fpayments%2Fregistration-checkout');

  const { data, error: accessError } = await supabase.rpc('get_my_registration_access');
  const access = !accessError ? parseRegistrationAccess(data) : null;
  if (!access) return status('unavailable');
  // An old notification can have the wrong role. Only the signed-in account
  // determines what it owes; reminders never start a buyer's seller upgrade.
  const role = registrationReminderRole(access);
  if (!role) return status('no-fee');
  if (!paystackIsEnabled()) return status('unavailable');

  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const purpose = `${role}_registration`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: intent, error: intentError } = await supabase.rpc(
        role === 'vendor' ? 'resume_vendor_registration_payment' : 'resume_student_registration_payment',
        { p_idempotency_key: `registration-reminder-${randomUUID()}` },
      );
      if (intentError || !intent?.payment_reference) return status('details');
      const { data: payment, error: savedError } = await admin.from('payments')
        .select('id,amount,currency,status,provider_environment,provider_checkout_initialized_at')
        .eq('payment_reference', intent.payment_reference).eq('user_id', user.id)
        .eq('payment_type', purpose).eq('provider', 'paystack').maybeSingle();
      if (savedError || !payment || payment.currency !== 'GHS' || !Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0) {
        return status('unavailable');
      }
      if (payment.status === 'success') return status('paid');
      if (payment.provider_checkout_initialized_at || payment.status !== 'initiated') {
        const result = await reconcilePaystackPayment(intent.payment_reference);
        if (result.status === 'success' && result.applied) return status('paid');
        if ((result.status === 'failed' || result.status === 'cancelled') && result.applied) continue;
        if (result.status === 'pending') {
          const hostedUrl = await readHostedRegistrationCheckout(admin, payment.id);
          if (hostedUrl) return redirect(hostedUrl);
        }
        return status('check');
      }
      const mode = getPaystackMode();
      if (payment.provider_environment && payment.provider_environment !== mode
          && !(payment.provider_environment === 'test' && mode === 'live')) return status('check');

      const { data: provider, error: providerError } = await admin.from('payment_providers')
        .select('is_enabled,supported_methods,config').eq('name', 'paystack').maybeSingle();
      if (providerError || !provider?.is_enabled) return status('unavailable');
      const channels = permittedChannels(provider.supported_methods || [], provider.config?.channels);
      if (!channels.length) return status('unavailable');

      const checkout = await initializePaystackTransaction({
        email: user.email,
        amountGhs: Number(payment.amount),
        reference: intent.payment_reference,
        callbackUrl: new URL('/payments/callback', registrationCheckoutOrigin(request.url)).href,
        channels,
        metadata: { unieco_payment_reference: intent.payment_reference, purpose, user_id: user.id },
      });
      const { error: markError } = await admin.rpc('record_paystack_checkout_initialized', {
        p_payment_reference: intent.payment_reference,
        p_provider_environment: mode,
      });
      if (markError) return status('check');
      await saveHostedRegistrationCheckout(admin, payment.id, checkout.authorizationUrl);
      return redirect(checkout.authorizationUrl);
    }
    return status('check');
  } catch (error) {
    console.error('[registration-checkout] could not safely resume', { name: error instanceof Error ? error.name : 'unknown' });
    return status('check');
  }
}
