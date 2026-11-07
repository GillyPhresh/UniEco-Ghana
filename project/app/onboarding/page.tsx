'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { safeInternalPath } from '@/lib/auth/redirects';
import { registrationDestination } from '@/lib/auth/registration-routing';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const checkInFlight = useRef(false);

  useEffect(() => {
    if (loading || checkInFlight.current) return;
    if (!user) {
      router.replace('/signin?next=%2Fonboarding');
      return;
    }

    let active = true;
    checkInFlight.current = true;
    setCheckingAccess(true);
    setCheckFailed(false);
    const requestedNext = safeInternalPath(new URLSearchParams(window.location.search).get('next'));
    const params = new URLSearchParams();
    const pendingInvite = window.sessionStorage.getItem('unieco_pending_registration_invite');
    const pendingReferral = window.sessionStorage.getItem('unieco_pending_referral_code');
    if (pendingInvite) params.set('invite', pendingInvite);
    if (pendingReferral) params.set('ref', pendingReferral);
    const query = params.toString();

    let timeout: ReturnType<typeof setTimeout>;
    const timedOut = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Registration check timed out')), 12_000);
    });
    void Promise.race([supabase.rpc('get_my_registration_access'), timedOut]).then(({ data, error }) => {
      if (!active) return;
      if (error) throw error;
      if ((data as { allowed?: boolean } | null)?.allowed === true) {
        router.replace(requestedNext === '/' ? '/' : requestedNext);
      } else {
        const destination = registrationDestination(user, requestedNext);
        const separator = destination.includes('?') ? '&' : '?';
        router.replace(query ? `${destination}${separator}${query}` : destination);
      }
    }).catch(() => {
      if (active) setCheckFailed(true);
    }).finally(() => {
      clearTimeout(timeout!);
      if (active) {
        checkInFlight.current = false;
        setCheckingAccess(false);
      }
    });

    return () => {
      active = false;
      checkInFlight.current = false;
      clearTimeout(timeout!);
    };
  }, [loading, router, user, retryCount]);

  if (checkingAccess) return <main className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Preparing your secure registration…</main>;
  if (checkFailed) return <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-5 text-center"><p className="text-sm text-muted-foreground">We couldn’t confirm your registration because the connection took too long. Your account and payment are unchanged.</p><Button type="button" onClick={() => setRetryCount((count) => count + 1)}>Try again</Button></main>;
  return null;
}
