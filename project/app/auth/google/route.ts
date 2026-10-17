import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const PRODUCTION_CALLBACK = 'https://uniecoghana.com/auth/callback';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: PRODUCTION_CALLBACK },
  });

  if (error || !data.url) {
    console.error('[auth/google] OAuth start failed', {
      message: error?.message,
      code: error?.code,
    });
    return NextResponse.redirect(
      new URL('/signin?error=oauth_start_failed', requestUrl.origin),
    );
  }

  return NextResponse.redirect(data.url);
}
