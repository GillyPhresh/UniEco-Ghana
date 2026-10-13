'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { newPasswordSchema } from '@/lib/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

type FormData = z.infer<typeof newPasswordSchema>;

export default function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(newPasswordSchema),
  });

  const onSubmit = async (data: FormData) => {
    setAuthError(null);
    const { error } = await updatePassword(data.password);
    if (error) {
      setAuthError(error);
    } else {
      setDone(true);
      setTimeout(() => router.push('/signin'), 2000);
    }
  };

  if (done) {
    return (
      <AuthLayout title="Password updated">
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-7 w-7 text-success" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold">All set!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your password has been updated. Redirecting you to sign in...
            </p>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Enter your new password below">
      <div className="space-y-6">
        {authError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
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
            <Label htmlFor="confirmPassword">Confirm new password</Label>
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

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update password
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
