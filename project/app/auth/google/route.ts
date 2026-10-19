import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'https://uniecoghana.com';
  const requestedIntent = requestUrl.searchParams.get('intent');
  const intent = requestedIntent === 'external_vendor' ? 'external_vendor' : requestedIntent === 'student' ? 'student' : null;
  const requestedNext = requestUrl.searchParams.get('next');
  const next = requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//') && !requestedNext.includes('\\')
    ? requestedNext
    : intent ? '/onboarding' : '/';
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${publicOrigin}/auth/callback` },
  });

  if (error || !data.url) {
    console.error('[auth/google] OAuth start failed', {
      message: error?.message,
      code: error?.code,
    });
    return NextResponse.redirect(
      new URL('/signin?error=oauth_start_failed', publicOrigin),
    );
  }

  const response = NextResponse.redirect(data.url);
  response.cookies.set('unieco_oauth_next', next, { httpOnly: true, sameSite: 'lax', secure: requestUrl.protocol === 'https:', maxAge: 600, path: '/' });
  if (intent) response.cookies.set('unieco_oauth_intent', intent, { httpOnly: true, sameSite: 'lax', secure: requestUrl.protocol === 'https:', maxAge: 600, path: '/' });
  return response;
}
