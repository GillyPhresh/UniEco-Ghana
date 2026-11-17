import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { siteConfig } from '@/lib/constants/site';
import { safeInternalPath, withNext } from '@/lib/auth/redirects';
import { readRegistrationIntent } from '@/lib/auth/registration-access';
import { COURIER_WORK_PATH } from '@/lib/courier/domain';

function clearOAuthState(response: NextResponse) {
  response.cookies.delete('unieco_oauth_next');
  response.cookies.delete('unieco_oauth_intent');
  return response;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const publicOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '').replace(
    /^https:\/\/uniecoghana\.com$/,
    siteConfig.url,
  ) || siteConfig.url;
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next');
  const cookieNext = request.cookies.get('unieco_oauth_next')?.value;
  const destination = safeInternalPath(next || cookieNext);
  const intent = readRegistrationIntent(request.cookies.get('unieco_oauth_intent')?.value);

  if (!code) {
    return clearOAuthState(NextResponse.redirect(
      new URL('/signin?error=auth_callback_failed', publicOrigin),
    ));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const reason = error.code ?? error.name ?? 'oauth_exchange_failed';
    console.error('[auth/callback] Supabase code exchange failed', {
      code: error.code,
      name: error.name,
      message: error.message,
    });
    return clearOAuthState(NextResponse.redirect(
      new URL(
        `/signin?error=auth_callback_failed&reason=${encodeURIComponent(reason)}`,
        publicOrigin,
      ),
    ));
  }

  if (intent) {
    const { error: intentError } = await supabase.rpc('set_my_registration_intent', { p_intent: intent });
    if (intentError) {
      console.error('[auth/callback] Could not persist Google registration intent', { message: intentError.message });
      // The session is already established. Let onboarding retry from the
      // persisted account state instead of sending the user back to sign up.
    }
  }

  // An OAuth cookie is a signup hint, never permission to change a returning
  // account's lane or open checkout. Onboarding reads the saved entitlement.
  const path = new URL(destination, publicOrigin).pathname;
  // Signup metadata is a route hint only. All courier permissions are checked
  // separately against the authenticated profile and staff-approved application.
  const courierEntry = destination === COURIER_WORK_PATH
    || (!next && !cookieNext && data.user?.user_metadata?.signup_experience === 'courier');
  if (destination === COURIER_WORK_PATH && data.user && data.user.user_metadata?.signup_experience !== 'courier') {
    // Google can create a new account on sign-in. This non-authoritative
    // marker keeps that courier-only account out of paid signup reminders.
    await supabase.auth.updateUser({ data: { signup_experience: 'courier' } });
  }
  const safeDestination = courierEntry ? COURIER_WORK_PATH
    : path === '/institution-admin-invite' || path === '/onboarding' ? destination : withNext('/onboarding', destination);
  const response = NextResponse.redirect(new URL(safeDestination, publicOrigin));
  return clearOAuthState(response);
}
