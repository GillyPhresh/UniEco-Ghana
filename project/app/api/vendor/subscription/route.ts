import { createClient } from '@/lib/supabase/server';
import { vendorSubscriptionIdPattern } from '@/lib/payments/vendor-subscription';
import { billingJson, getVendorSubscriptionSnapshot } from '@/lib/payments/vendor-subscription.server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const vendorId = new URL(request.url).searchParams.get('vendor');
  if (!vendorId || !vendorSubscriptionIdPattern.test(vendorId)) return billingJson({ error: 'Invalid business account.' }, 400);
  try {
    const caller = await createClient();
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return billingJson({ error: 'Sign in to see your billing.' }, 401);
    return await getVendorSubscriptionSnapshot(caller, user.id, vendorId);
  } catch {
    return billingJson({ error: 'Billing could not be loaded. Please try again.' }, 503);
  }
}
