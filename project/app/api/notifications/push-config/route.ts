import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createClient();
  const bearerToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const { data: { user } } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  // The Edge Function is the component that signs outbound notifications.
  // Prefer its public key so a stale/mismatched Railway variable cannot create
  // subscriptions that the sender is unable to authenticate.
  let publicKey = process.env.VAPID_PUBLIC_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  const internalSecret = process.env.UNIECO_INTERNAL_FUNCTION_SECRET;
  if (supabaseUrl && internalSecret) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        headers: { 'x-unieco-internal-secret': internalSecret },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && typeof result.publicKey === 'string') publicKey = result.publicKey;
    } catch {
      // Fall back to the Railway public key if the function is temporarily unavailable.
    }
  }
  if (!publicKey) return NextResponse.json({ error: 'Push notifications are not configured' }, { status: 503 });

  return NextResponse.json({ publicKey }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
