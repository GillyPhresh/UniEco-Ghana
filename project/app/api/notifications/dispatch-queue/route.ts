import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Give the trusted communication worker an immediate opportunity to process
 * a notification created by the current user's action. The browser never
 * receives the internal function secret; this route adds it server-side.
 *
 * A scheduled worker is still required as the durable fallback for events
 * created outside an interactive browser session (payments, referrals, and
 * administrative broadcasts).
 */
export async function POST() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  const internalSecret = process.env.UNIECO_INTERNAL_FUNCTION_SECRET;
  if (!supabaseUrl || !internalSecret) {
    return NextResponse.json({ error: 'Notification delivery is not configured' }, { status: 503 });
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/dispatch-communication-queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-unieco-internal-secret': internalSecret,
      },
      body: JSON.stringify({ limit: 10 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error('Communication queue dispatch failed:', response.status);
      return NextResponse.json({ error: 'Notification delivery is temporarily unavailable' }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Communication queue dispatch request failed:', error);
    return NextResponse.json({ error: 'Notification delivery is temporarily unavailable' }, { status: 502 });
  }
}
