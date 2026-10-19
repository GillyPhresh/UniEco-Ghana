'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/signin?next=%2Fonboarding');
      return;
    }

    const intent = user.profile?.preferences?.registration_intent;
    if (user.role === 'external_vendor' || user.role === 'student_vendor' || intent === 'external_vendor') {
      router.replace('/onboarding/vendor');
    } else if (user.role === 'student') {
      router.replace('/onboarding/student');
    } else {
      router.replace('/');
    }
  }, [loading, router, user]);

  return null;
}
