'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

// Compatibility route for old bookmarks. New registrations do not require
// email confirmation; this route only continues authenticated users.
export default function VerifyEmailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/signup');
      return;
    }
    const intent = user.profile?.preferences?.registration_intent;
    router.replace(intent === 'external_vendor' || user.role === 'external_vendor' || user.role === 'student_vendor'
      ? '/onboarding/vendor'
      : '/onboarding/student');
  }, [loading, router, user]);

  return (
    <AuthLayout title="Continue your registration" showBackLink={false}>
      <div className="space-y-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <div>
          <h2 className="font-display text-xl font-semibold">Your account is ready</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Continue to your profile and finish registration. You do not need to wait for an email.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/onboarding">Continue <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
