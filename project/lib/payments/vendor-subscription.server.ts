import 'server-only';

import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { canInitializePaystack, parseRegistrationAccess } from '@/lib/auth/registration-access';
import {
  getPaystackMode, initializePaystackTransaction, paystackIsEnabled, permittedChannels,
} from '@/lib/payments/paystack.server';
import { reconcilePaystackPayment } from '@/lib/payments/paystack-reconciliation.server';
import {
  readHostedRegistrationCheckout, registrationCheckoutOrigin, saveHostedRegistrationCheckout,
} from '@/lib/payments/registration-checkout.server';
import {
  vendorSubscriptionOpenStates, vendorSubscriptionPlan, vendorSubscriptionPlans,
  type VendorSubscriptionSnapshot,
} from '@/lib/payments/vendor-subscription';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export function billingJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

export function subscriptionAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function readVendorBilling(admin: SupabaseClient, actor: { id: string; role: string | null }, vendorId: string) {
  const vendor = await admin.from('vendors').select('is_student_business')
    .eq('id', vendorId).eq('owner_id', actor.id).maybeSingle();
  if (vendor.error) throw new Error('Vendor billing lookup failed.');
  if (!vendor.data) return null;
  const studentBusiness = vendor.data.is_student_business === true;
  const ledger = () => admin.from('payments').select('id,payment_reference,status,provider,amount,currency,provider_checkout_initialized_at')
    .eq('vendor_id', vendorId).eq('user_id', actor.id).eq('payment_type', 'subscription');
  const [student, latest, subscription, provider] = await Promise.all([
    studentBusiness && actor.role === 'student_vendor'
      ? admin.from('student_profiles').select('is_verified_student').eq('user_id', actor.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    ledger().eq('provider', 'paystack').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle(),
    admin.from('subscriptions').select('plan,status,ends_at').eq('vendor_id', vendorId)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle(),
    admin.from('payment_providers').select('is_enabled,supported_methods,config').eq('name', 'paystack').maybeSingle(),
  ]);
  // Read the open states after the snapshot anchor so a new reference created
  // during these reads is either found here or protected by the same intent key.
  const open = await ledger().in('status', [...vendorSubscriptionOpenStates])
    .order('created_at', { ascending: false }).limit(2);
  if (student.error || latest.error || subscription.error || provider.error || open.error) {
    throw new Error('Vendor billing data could not be read.');
  }
  const plan = vendorSubscriptionPlan(studentBusiness, actor.role, student.data?.is_verified_student === true);
  const channels = paystackIsEnabled() && provider.data?.is_enabled
    ? permittedChannels(provider.data.supported_methods || [], provider.data.config?.channels) : [];
  return { studentBusiness, plan, channels, latest: latest.data, subscription: subscription.data, open: open.data || [] };
}

export async function getVendorSubscriptionSnapshot(caller: SupabaseClient, actorId: string, vendorId: string) {
  const { data, error } = await caller.rpc('get_my_registration_access');
  const access = error ? null : parseRegistrationAccess(data);
  if (!access) return billingJson({ error: 'We could not check your account. Please try again.' }, 503);
  if (!canInitializePaystack(access, 'subscription')) return billingJson({ error: 'Finish setting up your vendor account first.' }, 403);
  const state = await readVendorBilling(subscriptionAdmin(), { id: actorId, role: access.role }, vendorId);
  if (!state) return billingJson({ error: 'Vendor billing was not found.' }, 404);
  const [open] = state.open;
  return billingJson({
    plan: state.plan, price: vendorSubscriptionPlans[state.plan].price, studentBusiness: state.studentBusiness,
    paystackAvailable: state.channels.length > 0, checkoutVersion: state.latest?.id || null, subscription: state.subscription,
    openPayment: open ? {
      reference: open.payment_reference, amount: Number(open.amount),
      status: state.open.length > 1 || open.provider !== 'paystack' ? 'reconciliation_required' : open.status,
      canResume: state.open.length === 1 && open.provider === 'paystack' && open.status !== 'reconciliation_required',
    } : null,
  } satisfies VendorSubscriptionSnapshot);
}

export async function initializeVendorSubscription(input: {
  admin: SupabaseClient; caller: SupabaseClient; vendorId: string; actor: { id: string; email: string; role: string | null };
  acceptedPrice: unknown; checkoutVersion: unknown; requestUrl: string;
}) {
  const { admin, caller, vendorId, actor } = input;
  const state = await readVendorBilling(admin, actor, vendorId);
  if (!state) return billingJson({ error: 'Vendor billing was not found.' }, 404);
  if (state.open.length > 1 || (state.open[0] && state.open[0].provider !== 'paystack')) {
    return billingJson({ error: 'An earlier subscription payment needs support review. No new checkout was started.' }, 409);
  }

  let payment = state.open[0];
  if (payment) {
    const reference = payment.payment_reference;
    try {
      const verified = await reconcilePaystackPayment(reference);
      if (verified.status === 'success' && verified.applied) {
        return billingJson({ reference, alreadyPaid: true, status: 'success' });
      }
      if (verified.status === 'pending') {
        const authorizationUrl = await readHostedRegistrationCheckout(admin, payment.id);
        if (authorizationUrl) return billingJson({ reference, authorizationUrl, status: 'pending' });
        return billingJson({ error: 'This payment is still pending. Check its status before paying again.', reference }, 409);
      }
      // Refresh after a terminal result. A second charge requires a fresh,
      // explicit confirmation on the billing page.
      if (verified.applied && ['failed', 'cancelled'].includes(verified.status)) {
        return billingJson({ error: 'The earlier attempt did not complete. Refresh billing to start a new payment.', reference }, 409);
      }
      return billingJson({ error: 'This payment needs support review. No new checkout was started.', reference }, 409);
    } catch (error) {
      // A verified not-found is safe to retry ONLY on the same reference,
      // and only if no previous initialization was recorded.
      const notFound = error instanceof Error && 'code' in error && error.code === 'not_found';
      if (!notFound || payment.status !== 'initiated' || payment.provider_checkout_initialized_at) {
        return billingJson({ error: 'We could not verify the earlier payment. Do not pay again if you were charged.', reference }, notFound ? 409 : 503);
      }
    }
  } else if (input.checkoutVersion !== (state.latest?.id || null)) {
    return billingJson({ error: 'Your billing changed. Refresh to check your latest payment before continuing.' }, 409);
  }

  if (!state.channels.length) return billingJson({ error: 'Paystack checkout is temporarily unavailable.' }, 503);
  const amount = vendorSubscriptionPlans[state.plan].price;
  if (input.acceptedPrice !== amount) return billingJson({ error: 'Your subscription price changed. Refresh billing to review the price.' }, 409);

  if (!payment) {
    // Uses the existing vendor row lock + unique (user,idempotency_key).
    // Concurrent tabs must resolve to the same reference even if they send
    // different browser keys. Paystack only accepts a reference once.
    const key = 'sub-' + createHash('sha256').update(vendorId + ':' + (state.latest?.id || 'first')).digest('hex');
    const { data, error } = await caller.rpc('create_subscription_payment_intent', {
      p_vendor_id: vendorId, p_provider: 'paystack', p_idempotency_key: key, p_auto_renew: false,
    });
    if (error || !data || data.user_id !== actor.id || data.vendor_id !== vendorId ||
        data.payment_type !== 'subscription' || data.provider !== 'paystack') {
      return billingJson({ error: 'We could not prepare a safe subscription checkout. No charge was started.' }, 409);
    }
    if (data.status === 'success') return billingJson({ reference: data.payment_reference, alreadyPaid: true, status: 'success' });
    if (data.status === 'pending' && data.provider_checkout_initialized_at) {
      const authorizationUrl = await readHostedRegistrationCheckout(admin, data.id);
      if (authorizationUrl) return billingJson({ reference: data.payment_reference, authorizationUrl, status: 'pending' });
      return billingJson({ error: 'A checkout is already open. Check its status before paying again.', reference: data.payment_reference }, 409);
    }
    payment = data;
  }
  if (payment.status !== 'initiated' || payment.currency !== 'GHS' || Number(payment.amount) !== amount ||
      !/^[A-Za-z0-9._=-]{8,120}$/.test(payment.payment_reference)) {
    return billingJson({ error: 'This payment no longer matches your plan. No charge was started; contact support if it remains pending.' }, 409);
  }
  const checkout = await initializePaystackTransaction({
    email: actor.email, amountGhs: amount, reference: payment.payment_reference,
    channels: state.channels, callbackUrl: registrationCheckoutOrigin(input.requestUrl) + '/payments/callback?flow=subscription',
    metadata: { unieco_payment_reference: payment.payment_reference, purpose: 'subscription', user_id: actor.id },
  });
  const { error } = await admin.rpc('record_paystack_checkout_initialized', {
    p_payment_reference: checkout.reference, p_provider_environment: getPaystackMode(),
  });
  if (error) return billingJson({ error: 'Checkout opened but could not be safely recorded. Check its status before paying again.', reference: checkout.reference }, 503);
  await saveHostedRegistrationCheckout(admin, payment.id, checkout.authorizationUrl);
  return billingJson({ reference: checkout.reference, authorizationUrl: checkout.authorizationUrl, status: 'pending' });
}
