'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RegistrationOptionPicker } from '@/components/registration/registration-option-picker';
import { useAuth } from '@/lib/auth/auth-context';
import { normalizeGhanaPhone, isValidGhanaPhone } from '@/lib/registration/phone';
import { supabase } from '@/lib/supabase/client';
import { RouteGuard } from '@/lib/auth/route-guard';
import { withNext } from '@/lib/auth/redirects';

type University = { id: string; name: string; short_name: string; city: string | null };

export default function BuyerOnboardingPage() {
  return <RouteGuard requireAuth><BuyerOnboarding /></RouteGuard>;
}

function BuyerOnboarding() {
  const { user, registrationAccess, refreshProfile, signOut } = useAuth();
  const router = useRouter();
  const [universities, setUniversities] = useState<University[]>([]);
  const [universityId, setUniversityId] = useState('');
  const [phone, setPhone] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [schoolStatus, setSchoolStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [schoolRetry, setSchoolRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const finishing = useRef(false);
  const canFinishBuyer = registrationAccess?.status === 'buyer_setup_required';

  useEffect(() => {
    if (canFinishBuyer || finishing.current) return;
    const next = new URLSearchParams(window.location.search).get('next');
    router.replace(withNext('/onboarding', next));
  }, [canFinishBuyer, router]);

  useEffect(() => {
    if (!canFinishBuyer) return;
    let active = true;
    void (async () => {
      try {
        const { data, error: loadError } = await supabase.from('universities').select('id,name,short_name,city').eq('is_enabled', true).order('name').abortSignal(AbortSignal.timeout(10_000));
        if (!active) return;
        setUniversities(!loadError && data ? data as University[] : []);
        setSchoolStatus(!loadError && data?.length ? 'ready' : 'unavailable');
      } catch {
        if (active) setSchoolStatus('unavailable');
      }
    })();
    return () => { active = false; };
  }, [canFinishBuyer, schoolRetry]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canFinishBuyer || submitLock.current) return;
    if (!universities.some((school) => school.id === universityId)) { setError('Choose your school to continue.'); return; }
    if (!isValidGhanaPhone(phone)) { setError('Enter a valid Ghana phone number, for example 0244 123 456.'); return; }
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: registrationError } = await supabase.rpc('complete_buyer_registration', {
        p_university_id: universityId,
        p_phone: normalizeGhanaPhone(phone),
        p_promotional_email_opt_in: marketingOptIn,
      }).abortSignal(AbortSignal.timeout(12_000));
      if (registrationError || data?.registration_type !== 'buyer') {
        setError('Couldn’t finish setup. Check your school and phone number, then try again.');
        return;
      }
      window.sessionStorage.removeItem('unieco_pending_referral_code');
      window.sessionStorage.removeItem('unieco_pending_registration_invite');
      window.sessionStorage.removeItem('unieco_pending_university_admin_token');
      const next = new URLSearchParams(window.location.search).get('next');
      finishing.current = true;
      await refreshProfile();
      router.replace(withNext('/onboarding/complete?registration=buyer', next));
    } catch {
      finishing.current = false;
      setError('Couldn’t confirm setup. Please try again. No payment is required.');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  if (!canFinishBuyer || !user) return <AuthLayout title="Checking your account" showBackLink={false}><Loader2 role="status" aria-label="Checking your account" className="mx-auto animate-spin text-primary" /></AuthLayout>;

  return <AuthLayout title="Set up your buyer account" subtitle="Choose your school and enter your phone number. It’s free."
    backLabel="Sign out" onBackClick={async () => { await signOut(); router.replace('/signin'); }}>
    <form onSubmit={submit} className="space-y-4">
      <RegistrationOptionPicker id="buyer-school" label="School" value={universityId}
        options={universities.map((school) => ({ value: school.id, label: `${school.name}${school.short_name !== school.name ? ` (${school.short_name})` : ''}${school.city ? ` — ${school.city}` : ''}` }))}
        placeholder={schoolStatus === 'loading' ? 'Loading schools…' : 'Find your school'} searchPlaceholder="School name or abbreviation"
        disabled={schoolStatus !== 'ready' || submitting} onChange={setUniversityId} />
      {schoolStatus === 'unavailable' && <div role="alert" className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>Couldn’t load schools.</span>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => { setSchoolStatus('loading'); setSchoolRetry((value) => value + 1); }}>Retry</Button>
      </div>}
      <div className="space-y-2"><Label htmlFor="buyer-phone">Phone number</Label><Input id="buyer-phone" className="h-12 text-base" type="tel" inputMode="tel" autoComplete="tel" maxLength={18} placeholder="0244 123 456" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={submitting} /></div>
      <label className="flex items-start gap-3 rounded-lg border p-3 text-sm text-muted-foreground">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} disabled={submitting} />
        <span>Email me seller tips and offers <span className="text-xs">(optional)</span></span>
      </label>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      <Button type="submit" className="min-h-12 w-full" disabled={submitting || schoolStatus !== 'ready'}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{submitting ? 'Finishing setup…' : 'Finish free setup'} {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}</Button>
    </form>
  </AuthLayout>;
}
