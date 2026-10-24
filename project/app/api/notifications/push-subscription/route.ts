import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

async function getAuthenticatedUser(request: Request) {
  const authClient = await createServerClient();
  const bearerToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearerToken) {
    const { data: { user } } = await authClient.auth.getUser(bearerToken);
    if (user) return user;
  }
  const { data: { user } } = await authClient.auth.getUser();
  return user;
}

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createSupabaseClient(
    supabaseUrl,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const serviceClient = getServiceClient();
  if (!serviceClient) return NextResponse.json({ error: 'Push notifications are not configured on this server' }, { status: 503 });

  const { data, error } = await serviceClient
    .from('push_subscriptions')
    .select('id, is_active, updated_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('Push subscription status failed:', error.message);
    return NextResponse.json({ error: 'Could not read push subscription status' }, { status: 500 });
  }
  return NextResponse.json({ enabled: (data || []).length > 0, activeSubscriptions: data || [] }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const body = await request.json();
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    const p256dh = typeof body.p256dh === 'string' ? body.p256dh : typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
    const auth = typeof body.auth === 'string' ? body.auth : typeof body.keys?.auth === 'string' ? body.keys.auth : '';
    const expirationTime = typeof body.expirationTime === 'number' && Number.isFinite(body.expirationTime)
      ? new Date(body.expirationTime).toISOString()
      : null;

    let endpointUrl: URL;
    try {
      endpointUrl = new URL(endpoint);
    } catch {
      return NextResponse.json({ error: 'Invalid push endpoint' }, { status: 400 });
    }

    if (endpointUrl.protocol !== 'https:' || !p256dh || !auth || endpoint.length > 2048 || p256dh.length > 512 || auth.length > 512) {
      return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 });
    }

    const serviceClient = getServiceClient();
    if (!serviceClient) {
      console.error('Push subscription storage is not configured.');
      return NextResponse.json({ error: 'Push notifications are not configured on this server' }, { status: 503 });
    }

    const { data: saved, error } = await serviceClient.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint,
      p256dh_key: p256dh,
      auth_key: auth,
      expiration_time: expirationTime,
      is_active: true,
    }, { onConflict: 'user_id,endpoint' }).select('id').single();

    if (error) {
      console.error('Push subscription save failed:', error.message);
      return NextResponse.json({ error: 'Could not save push subscription' }, { status: 500 });
    }
    const { count } = await serviceClient
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true);
    return NextResponse.json({ success: true, subscriptionId: saved?.id, activeSubscriptions: count || 0 });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
