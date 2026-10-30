import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './config';
import { safeInternalPath } from '@/lib/auth/redirects';

type CookieToSet = {
  name: string;
  value: string;
  options: Parameters<NextResponse['cookies']['set']>[2];
};

export async function updateSession(request: NextRequest) {
  const { url, anonKey } = getSupabaseConfig();
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname.replace(/\/+$/, '') || '/';
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  // These are member areas. Anonymous visitors can still see the public
  // landing page, but every app link requires an authenticated account.
  const memberRoutePrefixes = [
    '/business', '/campus-mate', '/cart', '/categories', '/checkout',
    '/dashboard', '/discover', '/events', '/marketplace', '/messages', '/notifications',
    '/orders', '/payment-history', '/profile', '/referrals', '/saved',
    '/search', '/start-business', '/universities', '/university',
    '/payments', '/vendor-dashboard', '/wishlist',
  ];
  const paymentProtectedPrefixes = [
    '/marketplace', '/discover', '/events', '/categories', '/business',
    '/dashboard', '/vendor-dashboard', '/profile', '/checkout', '/orders',
    '/search', '/wishlist', '/start-business', '/universities', '/benefits',
    '/university',
  ];
  const paymentGateExcluded = pathname === '/signin'
    || pathname === '/signup'
    || pathname.startsWith('/auth/')
    || pathname.startsWith('/verify-email')
    || pathname.startsWith('/forgot-password')
    || pathname.startsWith('/onboarding/')
    || pathname.startsWith('/payments/')
    || pathname.startsWith('/api/');
  const isPaymentProtectedRoute = paymentProtectedPrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isMemberRoute = memberRoutePrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
    || (pathname === '/' && Boolean(user));

  if (isMemberRoute && !user) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = '/signin';
    signInUrl.search = '';
    signInUrl.searchParams.set('next', safeInternalPath(`${pathname}${request.nextUrl.search}`));
    return NextResponse.redirect(signInUrl);
  }

  if (isAdminRoute) {
    const copySessionCookies = (response: NextResponse) => {
      supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
      response.headers.set('Cache-Control', 'private, no-store, max-age=0');
      response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      return response;
    };

    if (!user) {
      const signInUrl = request.nextUrl.clone();
      signInUrl.pathname = '/signin';
      signInUrl.search = '';
      signInUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return copySessionCookies(NextResponse.redirect(signInUrl));
    }

    // Resolve the application role from profiles via the existing database
    // authority; session metadata and browser role values are not trusted.
    const { data: role, error } = await supabase.rpc('current_app_role');
    const moderatorPermission = pathname === '/admin/moderation' || pathname === '/admin/trust-safety'
      ? 'can_review_reports'
      : pathname === '/admin/advertisements' || pathname.startsWith('/admin/advertisements/')
        ? 'can_moderate_content'
      : pathname === '/admin/reviews' || pathname.startsWith('/admin/reviews/')
        ? 'can_moderate_content'
      : pathname === '/admin/events' || pathname.startsWith('/admin/events/')
        ? 'can_moderate_content'
      : pathname === '/admin/support' || pathname.startsWith('/admin/support/')
        ? 'can_manage_support'
      : pathname === '/admin/communication' || pathname.startsWith('/admin/communication/')
        ? 'can_manage_communications'
        : pathname === '/admin/verification' || pathname.startsWith('/admin/verification/')
          ? 'can_review_verifications'
          : null;
    let isPlatformStaff = role === 'super_admin';

    // Platform moderators only enter modules for which the database-backed
    // role_permissions table grants the corresponding operational capability.
    if (role === 'moderator' && moderatorPermission && !error) {
      const { data: permitted, error: permissionError } = await supabase.rpc('has_permission', {
        p_permission: moderatorPermission,
      });
      isPlatformStaff = !permissionError && permitted === true;
    }
    if (role === 'moderator' && pathname === '/admin' && !error) {
      const overviewPermissions = [
        'can_review_reports', 'can_review_verifications', 'can_manage_support',
        'can_moderate_content', 'can_manage_communications',
      ];
      const permissionResults = await Promise.all(overviewPermissions.map(p_permission =>
        supabase.rpc('has_permission', { p_permission }),
      ));
      isPlatformStaff = permissionResults.some(result => !result.error && result.data === true);
    }
    const isAssignedUniversityAdminRoute = role === 'university_admin' && (
      pathname === '/admin' || pathname === '/admin/universities' || pathname === '/admin/orders' || pathname === '/admin/delivery' || pathname === '/admin/events' || pathname === '/admin/announcements' || pathname === '/admin/search'
      || pathname === '/admin/businesses' || pathname === '/admin/verification/students' || pathname === '/admin/verification/vendors'
      || pathname === '/admin/students'
      || pathname === '/admin/university-admin'
    );

    if (error || (!isPlatformStaff && !isAssignedUniversityAdminRoute)) {
      return copySessionCookies(new NextResponse('Forbidden', { status: 403 }));
    }

    // Prevent authenticated operational responses from entering shared caches.
    supabaseResponse.headers.set('Cache-Control', 'private, no-store, max-age=0');
    supabaseResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  if (user && (isPaymentProtectedRoute || pathname === '/') && !paymentGateExcluded) {
    const { data: access, error: accessError } = await supabase.rpc('get_my_registration_access');
    if (!accessError && access && access.allowed !== true) {
      const target = access.role === 'student' ? '/onboarding/student' : '/onboarding/vendor';
      const paymentUrl = request.nextUrl.clone();
      paymentUrl.pathname = target;
      paymentUrl.search = '';
      paymentUrl.searchParams.set('payment_required', '1');
      paymentUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(paymentUrl);
    }
  }

  return supabaseResponse;
}
