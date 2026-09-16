'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth/auth-context';
import { AuthLayout } from '@/components/auth/auth-layout';
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
  GraduationCap,
  Store,
  Check,
  ArrowRight,
} from 'lucide-react';

type SignUpFormData = z.infer<typeof signUpSchema>;
type AccountType = 'student' | 'external_vendor';

export default function SignUpPage() {
  const { signUp, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = async (data: SignUpFormData) => {
    if (!accountType) return;
    setAuthError(null);
    const { error } = await signUp(data.email, data.password, {
      full_name: data.full_name,
    });
    if (error) {
      setAuthError(error);
    } else {
      router.push(
        accountType === 'student' ? '/onboarding/student' : '/onboarding/vendor'
      );
    }
  };

  const handleGoogle = async () => {
    setAuthError(null);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setAuthError(error);
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join the UniEco Ghana campus community"
    >
      <div className="space-y-6">
        {authError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!accountType ? (
            <motion.div
              key="account-type"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <p className="text-center text-sm text-muted-foreground">
                Choose your account type to get started
              </p>

              <AccountTypeCard
                icon={GraduationCap}
                title="Student Account"
                description="Browse businesses, purchase products, message vendors, and review businesses on your campus."
                selected={accountType === 'student'}
                onClick={() => setAccountType('student')}
              />

              <AccountTypeCard
                icon={Store}
                title="Business Account"
                description="Register your business, list products and services, receive orders, and reach thousands of students."
                selected={accountType === 'external_vendor'}
                onClick={() => setAccountType('external_vendor')}
              />

              <Button
                className="w-full"
                disabled={!accountType}
                onClick={() => accountType && setAccountType(accountType)}
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {accountType === 'student' ? (
                    <GraduationCap className="h-4 w-4 text-primary" />
                  ) : (
                    <Store className="h-4 w-4 text-primary" />
                  )}
                  <span className="font-medium text-foreground">
                    {accountType === 'student' ? 'Student' : 'Business'} Account
                  </span>
                </div>
                <button
                  onClick={() => setAccountType(null)}
                  className="text-xs text-primary hover:underline"
                >
                  Change
                </button>
              </div>

              <Button
                variant="outline"
                className="w-full"
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

              <div className="relative">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">
                  or sign up with email
                </span>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="full_name"
                      placeholder="Ama Serwaa"
                      className="pl-9"
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
                      className="pl-9"
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
                      placeholder="Create a strong password"
                      className="px-9"
                      autoComplete="new-password"
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                      className="pl-9"
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
                    <Link href="#" className="text-primary hover:underline">Terms of Service</Link>{' '}
                    and{' '}
                    <Link href="#" className="text-primary hover:underline">Privacy Policy</Link>
                  </span>
                </label>
                {errors.terms && (
                  <p className="text-xs text-destructive">{errors.terms.message}</p>
                )}

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create account
                </Button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/signin" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

function AccountTypeCard({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: typeof GraduationCap;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all ${
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-primary/40 hover:bg-muted/50'
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors ${
          selected ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex-1">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {selected && <Check className="mt-1 h-5 w-5 shrink-0 text-primary" />}
    </button>
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
