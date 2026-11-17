import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { siteConfig } from '@/lib/constants/site';
import { safeInternalPath } from '@/lib/auth/redirects';
import { readRegistrationIntent } from '@/lib/auth/registration-access';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '').replace(
    /^https:\/\/uniecoghana\.com$/,
    siteConfig.url,
  ) || siteConfig.url;
  const intent = readRegistrationIntent(requestUrl.searchParams.get('intent'));
  const requestedNext = requestUrl.searchParams.get('next');
  const next = safeInternalPath(requestedNext, '/onboarding');
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
  else response.cookies.delete('unieco_oauth_intent');
  return response;
}
