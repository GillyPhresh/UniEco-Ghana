'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { safeInternalPath, withNext } from '@/lib/auth/redirects';
import { parseRegistrationAccess, registrationDestination, type RegistrationIntent } from '@/lib/auth/registration-access';
import { supabase } from '@/lib/supabase/client';
import { AuthLayout } from '@/components/auth/auth-layout';
import { AccountChoices } from '@/components/registration/account-choices';
import { Button } from '@/components/ui/button';

export default function OnboardingPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'choose' | 'error' | 'unavailable'>('checking');
  const [choosing, setChoosing] = useState(false);
  const [choiceError, setChoiceError] = useState(false);
  const [retry, setRetry] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    const requestedNext = safeInternalPath(params.get('next'));
    if (!userId) {
      router.replace(withNext('/signin', requestedNext));
      return;
    }
    // These destinations check the signed-in account themselves. In
    // particular, a seller returning from Paystack after signing back in
    // must check the same payment instead of starting another one.
    const requestedPath = new URL(requestedNext, window.location.origin).pathname;
    if (['/institution-admin-invite', '/payments/callback', '/payments/registration-checkout'].includes(requestedPath)) {
      router.replace(requestedNext);
      return;
    }
    let active = true;
    setState('checking');
    void (async () => {
      const { data, error } = await supabase.rpc('get_my_registration_access').abortSignal(AbortSignal.timeout(10_000));
      if (!active) return;
      const access = !error ? parseRegistrationAccess(data) : null;
      if (!access) { setState('error'); return; }
      if (access.status === 'choice_required') { setState('choose'); return; }
      if (!access.allowed && !access.registration_path) { setState('unavailable'); return; }
      if (access.allowed) {
        router.replace(requestedNext.startsWith('/onboarding') ? '/' : requestedNext);
        return;
      }
      // Preserve paid registration invitations through the entry route only.
      if (!access.buyer_restricted) {
        const pendingInvite = params.get('invite');
        const pendingReferral = params.get('ref');
        if (pendingInvite) window.sessionStorage.setItem('unieco_pending_registration_invite', pendingInvite);
        if (pendingReferral) window.sessionStorage.setItem('unieco_pending_referral_code', pendingReferral);
      }
      router.replace(registrationDestination(access, requestedNext));
    })().catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [loading, router, userId, retry]);

  async function choose(intent: RegistrationIntent) {
    if (choosing || !userId) return;
    setChoosing(true);
    setChoiceError(false);
    try {
      const { error } = await supabase.rpc('set_my_registration_intent', { p_intent: intent }).abortSignal(AbortSignal.timeout(10_000));
      if (error) throw error;
      setRetry((value) => value + 1);
    } catch {
      setChoiceError(true);
    } finally {
      setChoosing(false);
    }
  }

  if (state === 'choose' && !loading) return <AuthLayout title="Choose an account type" subtitle="How will you use UniEco Ghana?">
    <AccountChoices onChoose={(intent) => void choose(intent)} busy={choosing} />
    {choiceError && <p role="alert" className="mt-3 text-sm text-destructive">We couldn’t save your choice. Please try again.</p>}
  </AuthLayout>;

  if (state === 'error' || state === 'unavailable') return <AuthLayout title={state === 'error' ? 'Couldn’t check registration' : 'Registration unavailable'}>
    <div className="space-y-4 text-sm">
      <p role="alert" className="text-muted-foreground">{state === 'error' ? 'Check your connection and try again. No payment was started.' : 'This account can’t finish registration. Contact support if you need help.'}</p>
      {state === 'error' && <Button type="button" className="min-h-12 w-full" onClick={() => setRetry((value) => value + 1)}>Try again</Button>}
      <Button asChild variant="outline" className="min-h-11 w-full"><Link href="mailto:support@uniecoghana.com">Contact support</Link></Button>
      <Button type="button" variant="ghost" className="w-full" onClick={async () => { await signOut(); router.replace('/signin'); }}>Sign out</Button>
    </div>
  </AuthLayout>;

  return <AuthLayout title="Checking your account" showBackLink={false}>
    <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-5 animate-spin" /> One moment…</div>
  </AuthLayout>;
}
