'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { safeInternalPath } from '@/lib/auth/redirects';
import { registrationDestination } from '@/lib/auth/registration-routing';
import { supabase } from '@/lib/supabase/client';

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(false);

  useEffect(() => {
    if (loading || checkingAccess) return;
    if (!user) {
      router.replace('/signin?next=%2Fonboarding');
      return;
    }

    let active = true;
    setCheckingAccess(true);
    const requestedNext = safeInternalPath(new URLSearchParams(window.location.search).get('next'));
    const params = new URLSearchParams();
    const pendingInvite = window.sessionStorage.getItem('unieco_pending_registration_invite');
    const pendingReferral = window.sessionStorage.getItem('unieco_pending_referral_code');
    const pendingUniversityAdminToken = window.sessionStorage.getItem('unieco_pending_university_admin_token');
    if (pendingInvite) params.set('invite', pendingInvite);
    if (pendingReferral) params.set('ref', pendingReferral);
    if (pendingUniversityAdminToken) params.set('university_admin_token', pendingUniversityAdminToken);
    const query = params.toString();

    void supabase.rpc('get_my_registration_access').then(({ data, error }) => {
      if (!active) return;
      // A failed access check never sends an account into the platform. The
      // registration screen remains the safe recovery path and can retry the
      // authoritative payment flow.
      if (!error && (data as { allowed?: boolean } | null)?.allowed === true) {
        router.replace(requestedNext === '/' ? '/' : requestedNext);
      } else {
        const destination = registrationDestination(user, requestedNext);
        const separator = destination.includes('?') ? '&' : '?';
        router.replace(query ? `${destination}${separator}${query}` : destination);
      }
      setCheckingAccess(false);
    });

    return () => { active = false; };
  }, [loading, router, user]);

  return checkingAccess ? <main className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">Preparing your secure registration…</main> : null;
}
