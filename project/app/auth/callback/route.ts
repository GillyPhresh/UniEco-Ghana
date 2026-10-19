import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next');
  const cookieNext = request.cookies.get('unieco_oauth_next')?.value;
  const destination = (next || cookieNext) && (next || cookieNext)!.startsWith('/') && !(next || cookieNext)!.startsWith('//') && !(next || cookieNext)!.includes('\\')
    ? (next || cookieNext)!
    : '/';
  const intent = request.cookies.get('unieco_oauth_intent')?.value;

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

  if (intent === 'student' || intent === 'external_vendor') {
    const { error: intentError } = await supabase.rpc('set_my_registration_intent', { p_intent: intent });
    if (intentError) {
      console.error('[auth/callback] Could not persist Google registration intent', { message: intentError.message });
      return NextResponse.redirect(new URL('/signup?error=google_onboarding_setup_failed', requestUrl.origin));
    }
  }

  const response = NextResponse.redirect(new URL(destination, requestUrl.origin));
  response.cookies.delete('unieco_oauth_next');
  response.cookies.delete('unieco_oauth_intent');
  return response;
}
