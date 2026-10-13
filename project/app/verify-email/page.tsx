'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { MailCheck, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VerifyEmailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      const role = user.role;
      if (role === 'student') {
        router.replace('/onboarding/student');
      } else if (role === 'external_vendor' || role === 'student_vendor') {
        router.replace('/onboarding/vendor');
      } else {
        router.replace('/');
      }
    }
  }, [user, loading, router]);

  return (
    <AuthLayout title="Verify your email" showBackLink={false}>
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">Check your inbox</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a verification link to your email address. Click the link to
            verify your account and continue setting up your profile.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-left">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Didn&apos;t get the email?</strong>{' '}
            Check your spam folder, or wait a few minutes for it to arrive. You can
            also sign in if you&apos;ve already verified.
          </p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/signin">Go to sign in</Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
