import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const body = await request.json();
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    const p256dh = typeof body.p256dh === 'string' ? body.p256dh : '';
    const auth = typeof body.auth === 'string' ? body.auth : '';
    const expirationTime = typeof body.expirationTime === 'number' ? new Date(body.expirationTime).toISOString() : null;

    if (!endpoint || !p256dh || !auth || endpoint.length > 2048) {
      return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 });
    }

    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error } = await serviceClient.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint,
      p256dh_key: p256dh,
      auth_key: auth,
      expiration_time: expirationTime,
      is_active: true,
    }, { onConflict: 'user_id,endpoint' });

    if (error) {
      console.error('Push subscription save failed:', error.message);
      return NextResponse.json({ error: 'Could not save push subscription' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
