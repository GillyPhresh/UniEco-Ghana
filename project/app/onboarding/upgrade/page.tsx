'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { RouteGuard } from '@/lib/auth/route-guard';
import { parseRegistrationAccess, registrationFeeLabel } from '@/lib/auth/registration-access';
import { supabase } from '@/lib/supabase/client';

export default function UpgradePage() {
  return <RouteGuard requireAuth><UpgradeScreen /></RouteGuard>;
}

function UpgradeScreen() {
  const router = useRouter();
  const { registrationAccess: access, refreshProfile } = useAuth();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pendingBuyer = access?.status === 'free_buyer';
  const existingBusiness = access?.role === 'external_vendor' || access?.role === 'student_vendor';
  const fee = registrationFeeLabel(existingBusiness ? access?.vendor_fee : access?.student_fee);

  async function startUpgrade() {
    if (!pendingBuyer || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await supabase.rpc('start_my_student_seller_upgrade').abortSignal(AbortSignal.timeout(10_000));
      const state = !result.error ? parseRegistrationAccess(result.data) : null;
      if (!state?.seller_upgrade_started || !state.registration_path) throw new Error('Upgrade unavailable');
      if (!access?.seller_upgrade_started) {
        window.sessionStorage.removeItem('unieco_pending_registration_invite');
        window.sessionStorage.removeItem('unieco_pending_referral_code');
        window.sessionStorage.removeItem('unieco_pending_university_admin_token');
      }
      await refreshProfile();
      router.replace(state.registration_path);
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <AuthLayout title="Upgrade to seller" subtitle={pendingBuyer ? 'Sell, publish campus posts and get a referral link after payment.' : undefined}>
    <div className="space-y-4 text-sm">
      {pendingBuyer ? <>
        <p className="rounded-xl bg-muted/50 p-3"><strong>{fee ? `${fee} one-time registration fee.` : 'One-time registration fee.'}</strong> You’ll review the fee before opening Paystack. You can keep using your free account in the meantime.</p>
        {error && <p role="alert" className="text-destructive">Couldn’t open seller setup. No payment was started. Try again.</p>}
        <Button type="button" className="min-h-12 w-full" disabled={busy} onClick={() => void startUpgrade()}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}{access?.seller_upgrade_started ? 'Resume seller setup' : 'Start seller setup'}<ArrowRight className="ml-2 size-4" />
        </Button>
        <Button asChild variant="ghost" className="min-h-11 w-full"><Link href="/">Keep using UniEco</Link></Button>
      </> : <>
        <p className="text-muted-foreground">{access?.status === 'buyer_setup_required' ? 'Finish your free buyer setup first.' : 'Check your account to see the registration options available to you.'}</p>
        <Button asChild className="min-h-12 w-full"><Link href="/onboarding">Continue to UniEco</Link></Button>
      </>}
    </div>
  </AuthLayout>;
}
