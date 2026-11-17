'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

// Compatibility route for old bookmarks. New registrations do not require
// email confirmation; this route only continues authenticated users.
export default function VerifyEmailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/onboarding' : '/signin');
  }, [loading, router, user]);

  return (
    <AuthLayout title="Continue your registration" showBackLink={false}>
      <div className="text-center">
        <Button asChild className="w-full">
          <Link href={user ? '/onboarding' : '/signin'}>Continue <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
