import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { siteConfig } from '@/lib/constants/site';
import { getPaystackMode } from '@/lib/payments/paystack.server';

export function registrationCheckoutOrigin(requestUrl?: string) {
  if (process.env.UNIECO_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_NAME === 'production') {
    return siteConfig.url;
  }
  try {
    const url = new URL(process.env.UNIECO_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || requestUrl || siteConfig.url);
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      return url.hostname === 'uniecoghana.com' ? siteConfig.url : url.origin;
    }
  } catch { /* Use the canonical URL if deployment configuration is invalid. */ }
  return siteConfig.url;
}

export function isHostedRegistrationCheckout(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\/checkout\.paystack\.com\/[a-zA-Z0-9._-]{1,200}\/?$/.test(value);
}

export async function readHostedRegistrationCheckout(admin: SupabaseClient, paymentId: string) {
  const { data, error } = await admin.from('registration_paystack_checkouts')
    .select('authorization_url').eq('payment_id', paymentId).eq('provider_environment', getPaystackMode()).maybeSingle();
  if (error && !['PGRST205', '42P01'].includes(error.code)) {
    console.error('[registration-checkout] checkout lookup failed', { code: error.code });
  }
  const url: unknown = data?.authorization_url;
  return isHostedRegistrationCheckout(url) ? url : null;
}

export async function saveHostedRegistrationCheckout(admin: SupabaseClient, paymentId: string, url: string) {
  if (!isHostedRegistrationCheckout(url)) return;
  const { error } = await admin.from('registration_paystack_checkouts').upsert({
    payment_id: paymentId, provider_environment: getPaystackMode(), authorization_url: url,
  }, { onConflict: 'payment_id', ignoreDuplicates: true });
  if (error && !['PGRST205', '42P01'].includes(error.code)) {
    console.error('[registration-checkout] checkout storage failed', { code: error.code });
  }
}
