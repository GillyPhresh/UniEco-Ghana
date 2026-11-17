'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth/auth-context';
import { safeInternalPath, withNext } from '@/lib/auth/redirects';
import { readRegistrationIntent, signupReferralCode, type RegistrationIntent } from '@/lib/auth/registration-access';
import { AuthLayout } from '@/components/auth/auth-layout';
import { AccountChoices, registrationAccountName } from '@/components/registration/account-choices';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { signUpSchema } from '@/lib/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';

type SignUpFormData = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const { signUp, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [accountType, setAccountType] = useState<RegistrationIntent | null>(null);
  const [institutionInvite, setInstitutionInvite] = useState(false);
  const [sellerInvite, setSellerInvite] = useState(false);
  const [confirmationDestination, setConfirmationDestination] = useState<string | null>(null);
  const [requestedNext, setRequestedNext] = useState('/');
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const tokenFromFragment = fragment.get('university_admin_token');
    if (tokenFromFragment) {
      window.sessionStorage.setItem('unieco_pending_university_admin_token', tokenFromFragment);
      // Keep the referral token out of browser history, preserving Next's history state.
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    }
    setInstitutionInvite(query.has('institution_admin_invite'));
    setSellerInvite(query.has('invite') || query.has('ref') || Boolean(tokenFromFragment));
    setAccountType(readRegistrationIntent(query.get('intent')));
    setRequestedNext(safeInternalPath(query.get('next')));
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
  });

  const signupDestination = () => {
    const query = new URLSearchParams(window.location.search);
    const institutionAdminInvite = query.get('institution_admin_invite');
    if (institutionAdminInvite) {
      window.sessionStorage.setItem('unieco_pending_institution_admin_invite', institutionAdminInvite);
      return `/institution-admin-invite?token=${encodeURIComponent(institutionAdminInvite)}`;
    }
    const paidLane = accountType === 'student' || accountType === 'external_vendor';
    const linkedIntent = readRegistrationIntent(query.get('intent'));
    const incomingReferral = signupReferralCode(query.get('ref'), accountType);
    const incomingInvite = paidLane && (!linkedIntent || linkedIntent === accountType) ? query.get('invite') : null;
    if (incomingReferral) window.sessionStorage.setItem('unieco_pending_referral_code', incomingReferral);
    else window.sessionStorage.removeItem('unieco_pending_referral_code');
    if (incomingInvite) window.sessionStorage.setItem('unieco_pending_registration_invite', incomingInvite);
    else window.sessionStorage.removeItem('unieco_pending_registration_invite');
    // Keep the university-admin bearer token out of URLs and referrer logs.
    const universityAdminToken = paidLane ? query.get('university_admin_token') : null;
    if (universityAdminToken) window.sessionStorage.setItem('unieco_pending_university_admin_token', universityAdminToken);
    if (!paidLane) window.sessionStorage.removeItem('unieco_pending_university_admin_token');
    return withNext('/onboarding', requestedNext);
  };

  const onSubmit = async (data: SignUpFormData) => {
    if ((!accountType && !institutionInvite) || googleLoading) return;
    setAuthError(null);
    const destination = signupDestination();
    const { error, session } = await signUp(data.email, data.password, {
      full_name: data.full_name,
      registration_intent: institutionInvite ? undefined : accountType ?? undefined,
    });
    if (error) setAuthError(error);
    else if (!session) setConfirmationDestination(destination.startsWith('/institution-admin-invite') ? destination : requestedNext);
    else router.replace(destination);
  };

  const handleGoogle = async () => {
    if ((!accountType && !institutionInvite) || googleLoading || isSubmitting) return;
    setAuthError(null);
    const next = signupDestination();
    setGoogleLoading(true);
    const { error } = await signInWithGoogle({ intent: institutionInvite ? undefined : accountType ?? undefined, next });
    if (error) {
      setAuthError(error);
      setGoogleLoading(false);
    }
  };

  if (confirmationDestination !== null) {
    return <AuthLayout title="Check your email" subtitle="If a confirmation link was sent, open it first. Then sign in to finish setup.">
      <Button asChild className="min-h-12 w-full"><Link href={withNext('/signin', confirmationDestination)}>Go to sign in</Link></Button>
    </AuthLayout>;
  }

  return (
    <AuthLayout
      title="Join UniEco Ghana"
      subtitle={institutionInvite ? 'Use the email address on your invitation.' : accountType ? undefined : 'Choose how you want to use UniEco.'}
    >
      <div className="space-y-5">
        {authError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!accountType && !institutionInvite ? (
            <motion.div
              key="account-type"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <AccountChoices onChoose={setAccountType} sellerInvite={sellerInvite} />
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {accountType && !institutionInvite && <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-1">
                <div className="min-w-0 py-2">
                  <p className="text-sm font-semibold">{registrationAccountName(accountType)}</p>
                  <p className="text-xs text-muted-foreground">{accountType === 'buyer' ? 'Free · No registration payment' : 'One-time fee after your details'}</p>
                </div>
                <Button type="button" variant="ghost" onClick={() => { setAccountType(null); setAuthError(null); }} disabled={googleLoading || isSubmitting} className="min-h-11 shrink-0 px-2 text-primary">
                  <ArrowLeft className="mr-1 size-3.5" /> Change
                </Button>
              </div>}

              <Button
                variant="outline"
                className="min-h-12 w-full"
                onClick={handleGoogle}
                disabled={googleLoading || isSubmitting}
              >
                {googleLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <GoogleIcon className="mr-2 h-4 w-4" />
                )}
                Continue with Google
              </Button>
              <p className="text-xs text-muted-foreground">By continuing with Google, you agree to our{' '}
                <Link href="/terms-of-service" className="text-primary underline">Terms</Link> and{' '}
                <Link href="/privacy-policy" className="text-primary underline">Privacy Policy</Link>.
              </p>

              <div className="relative">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">
                  or sign up with email
                </span>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="full_name"
                      placeholder="Ama Serwaa"
                      className="h-12 pl-9 text-base"
                      autoComplete="name"
                      {...register('full_name')}
                    />
                  </div>
                  {errors.full_name && (
                    <p className="text-xs text-destructive">{errors.full_name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      className="h-12 pl-9 text-base"
                      autoComplete="email"
                      {...register('email')}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 8 characters"
                      className="h-12 pl-9 pr-12 text-base"
                      autoComplete="new-password"
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Re-enter your password"
                      className="h-12 pl-9 text-base"
                      autoComplete="new-password"
                      {...register('confirmPassword')}
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-xs text-destructive">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <label className="flex items-start gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    {...register('terms')}
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                  />
                  <span>
                    I agree to the{' '}
                    <Link href="/terms-of-service" className="text-primary hover:underline">Terms of Service</Link>{' '}
                    and{' '}
                    <Link href="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link>
                  </span>
                </label>
                {errors.terms && (
                  <p className="text-xs text-destructive">{errors.terms.message}</p>
                )}

                <Button type="submit" className="min-h-12 w-full" disabled={isSubmitting || googleLoading}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Creating account…' : accountType === 'buyer' ? 'Create free account' : 'Create account'}
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href={withNext('/signin', requestedNext)} className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
