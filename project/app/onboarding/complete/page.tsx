'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { safeInternalPath } from '@/lib/auth/redirects';
import { parseRegistrationAccess, SELLER_UPGRADE_PATH, type RegistrationAccess } from '@/lib/auth/registration-access';
import { RouteGuard } from '@/lib/auth/route-guard';
import { useAuth } from '@/lib/auth/auth-context';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { PushPermissionCard } from '@/components/notifications/push-permission-card';
import { supabase } from '@/lib/supabase/client';

export default function OnboardingCompletePage() {
  return <RouteGuard requireAuth><CompleteScreen /></RouteGuard>;
}

function CompleteScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [access, setAccess] = useState<RegistrationAccess | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setCheckFailed(false);
    setAccess(null);
    void (async () => {
      const { data, error } = await supabase.rpc('get_my_registration_access').abortSignal(AbortSignal.timeout(10_000));
      if (!active) return;
      const state = error ? null : parseRegistrationAccess(data);
      if (!state) { setCheckFailed(true); return; }
      if (state.allowed !== true || !['paid', 'cash_verified', 'free_buyer'].includes(state.status)) {
        setCheckFailed(true);
        return;
      }
      // A callback query parameter is a navigation hint, not proof of payment.
      setAccess(state);
    })().catch(() => { if (active) setCheckFailed(true); });
    return () => { active = false; };
  }, [userId, retry]);

  if (!access) return <AuthLayout title={checkFailed ? 'Couldn’t confirm access' : 'Checking your account'} showBackLink={false}>
    <div className="space-y-4 text-center text-sm text-muted-foreground">
      {checkFailed ? <>
        <p role="alert">If you already paid, don’t pay again. Retry this check or contact support.</p>
        <Button type="button" className="min-h-12 w-full" onClick={() => setRetry((count) => count + 1)}>Check again</Button>
        <Button variant="outline" asChild className="min-h-11 w-full"><Link href="mailto:support@uniecoghana.com">Contact support</Link></Button>
        <Button variant="ghost" asChild className="min-h-11 w-full"><Link href="/onboarding">Go to my account</Link></Button>
      </> : <Loader2 role="status" aria-label="Checking your account" className="mx-auto size-6 animate-spin text-primary" />}
    </div>
  </AuthLayout>;

  const buyer = access.status === 'free_buyer';
  const vendor = !buyer && (access.role === 'external_vendor' || access.role === 'student_vendor');
  const defaultDestination = vendor ? '/vendor-dashboard' : '/';
  function continueToAccount() {
    const next = safeInternalPath(new URLSearchParams(window.location.search).get('next'), defaultDestination);
    window.sessionStorage.removeItem('unieco_registration_next');
    router.replace(next.startsWith('/onboarding') ? defaultDestination : next);
  }

  return <AuthLayout title={buyer ? 'Your buyer account is ready' : vendor ? 'Business setup complete' : 'Student seller setup complete'} showBackLink={false}>
    <div className="space-y-4 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-success/10 text-success"><CheckCircle2 className="size-8" aria-hidden="true" /></span>
      <p className="text-sm text-muted-foreground">{buyer
        ? 'Shop, message sellers and explore your campus. No registration payment was needed.'
        : vendor ? 'Open your dashboard to manage your business. Listings still need approval before going live.'
          : access.can_publish ? 'You can now publish campus posts. Verify your student details to register a student business.'
            : 'Your account is active. Check your profile for any remaining verification steps.'}</p>
      <Button type="button" onClick={continueToAccount} className="min-h-12 w-full">
        {vendor ? 'Open business dashboard' : 'Continue to UniEco'}<ArrowRight className="ml-2 size-4" />
      </Button>
      {buyer && <Button asChild variant="ghost" className="min-h-11 w-full"><Link href={SELLER_UPGRADE_PATH}>See seller options</Link></Button>}
      {!buyer && !vendor && access.can_student_referral && <Button asChild variant="ghost" className="min-h-11 w-full"><Link href="/dashboard/referrals">View your referral link</Link></Button>}
      <details className="rounded-xl border px-3 py-2 text-left">
        <summary className="cursor-pointer py-1 text-sm font-medium">Notifications (optional)</summary>
        <div className="mt-2"><PushPermissionCard onboarding /></div>
      </details>
    </div>
  </AuthLayout>;
}
