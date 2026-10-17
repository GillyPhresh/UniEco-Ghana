import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next');
  const destination = next && next.startsWith('/') && !next.startsWith('//')
    ? next
    : '/';

  if (!code) {
    return NextResponse.redirect(
      new URL('/signin?error=auth_callback_failed', requestUrl.origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const reason = error.code ?? error.name ?? 'oauth_exchange_failed';
    console.error('[auth/callback] Supabase code exchange failed', {
      code: error.code,
      name: error.name,
      message: error.message,
    });
    return NextResponse.redirect(
      new URL(
        `/signin?error=auth_callback_failed&reason=${encodeURIComponent(reason)}`,
        requestUrl.origin,
      ),
    );
  }

  return NextResponse.redirect(new URL(destination, requestUrl.origin));
}
