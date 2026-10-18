import { updateSession } from '@/lib/supabase/middleware';
import { NextResponse } from 'next/server';

export async function middleware(request: Parameters<typeof updateSession>[0]) {
  const hostname = request.headers.get('host')?.split(':')[0].toLowerCase();
  if (hostname === 'www.uniecoghana.com') {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = 'uniecoghana.com';
    canonicalUrl.port = '';
    canonicalUrl.protocol = 'https:';
    return NextResponse.redirect(canonicalUrl, 308);
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|manifest|js)$).*)',
  ],
};
