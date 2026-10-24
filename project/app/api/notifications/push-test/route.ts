import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  const internalSecret = process.env.UNIECO_INTERNAL_FUNCTION_SECRET;
  if (!supabaseUrl || !internalSecret) {
    return NextResponse.json({ error: 'Push delivery is not configured on the server' }, { status: 503 });
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-unieco-internal-secret': internalSecret,
      },
      body: JSON.stringify({
        recipientId: user.id,
        title: 'UniEco Ghana test notification',
        body: 'Push notifications are working on this device.',
        actionUrl: '/dashboard/notifications',
        eventType: 'push_test',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string; sentCount?: number; failedCount?: number };
    if (!response.ok || result.success !== true) {
      const status = result.error === 'No active push subscriptions for this user.' ? 409 : 502;
      return NextResponse.json({ error: result.error || 'Push delivery failed', sentCount: result.sentCount, failedCount: result.failedCount }, { status });
    }
    return NextResponse.json({ success: true, sentCount: result.sentCount || 0 });
  } catch (error) {
    console.error('Push test request failed:', error);
    return NextResponse.json({ error: 'Could not reach the push delivery service' }, { status: 502 });
  }
}
