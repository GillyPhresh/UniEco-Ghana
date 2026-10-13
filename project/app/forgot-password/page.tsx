'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetPasswordSchema } from '@/lib/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Mail, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

type FormData = z.infer<typeof resetPasswordSchema>;

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [sent, setSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: FormData) => {
    setAuthError(null);
    const { error } = await resetPassword(data.email);
    if (error) {
      setAuthError(error);
    } else {
      setSent(true);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll send you a link to reset your password"
    >
      {sent ? (
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-7 w-7 text-success" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold">Check your email</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a password reset link to your email address. Click the link
              to set a new password. If you don&apos;t see it, check your spam folder.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href="/signin">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {authError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send reset link
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Remember your password?{' '}
            <Link href="/signin" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
