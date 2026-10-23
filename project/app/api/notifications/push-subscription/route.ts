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

    let endpointUrl: URL;
    try {
      endpointUrl = new URL(endpoint);
    } catch {
      return NextResponse.json({ error: 'Invalid push endpoint' }, { status: 400 });
    }

    if (endpointUrl.protocol !== 'https:' || !p256dh || !auth || endpoint.length > 2048 || p256dh.length > 512 || auth.length > 512) {
      return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Push subscription storage is not configured.');
      return NextResponse.json({ error: 'Push notifications are not configured on this server' }, { status: 503 });
    }

    const serviceClient = createSupabaseClient(
      supabaseUrl,
      serviceRoleKey,
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
