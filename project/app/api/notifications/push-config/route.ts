import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function normalizeVapidPublicKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let key = value.trim().replace(/^['"`]|['"`]$/g, '');
  const labeled = key.match(/(?:vapid[_ -]?public[_ -]?key|public\s+key)\s*[:=]\s*([A-Za-z0-9+/_-]+={0,2})/i);
  if (labeled?.[1]) key = labeled[1];
  key = key.replace(/\s+/g, '');
  if (!key || key.includes('BEGIN') || key.includes('END')) return null;

  try {
    const bytes = Buffer.from(key.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (bytes.length !== 65 || bytes[0] !== 4) return null;
    return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch {
    return null;
  }
}

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
  const normalizedPublicKey = normalizeVapidPublicKey(publicKey);
  if (!normalizedPublicKey) {
    return NextResponse.json({ error: 'Push provider public key is invalid. Regenerate one VAPID key pair and use its public key on both Railway and Supabase.' }, { status: 503 });
  }

  return NextResponse.json({ publicKey: normalizedPublicKey }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
