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
    const params = new URLSearchParams();
    const pendingInvite = window.sessionStorage.getItem('unieco_pending_registration_invite');
    const pendingReferral = window.sessionStorage.getItem('unieco_pending_referral_code');
    const pendingUniversityAdminToken = window.sessionStorage.getItem('unieco_pending_university_admin_token');
    if (pendingInvite) params.set('invite', pendingInvite);
    if (pendingReferral) params.set('ref', pendingReferral);
    if (pendingUniversityAdminToken) params.set('university_admin_token', pendingUniversityAdminToken);
    const query = params.toString();
    if (user.role === 'external_vendor' || user.role === 'student_vendor' || intent === 'external_vendor') {
      router.replace(query ? `/onboarding/vendor?${query}` : '/onboarding/vendor');
    } else if (user.role === 'student') {
      router.replace(query ? `/onboarding/student?${query}` : '/onboarding/student');
    } else {
      router.replace('/');
    }
  }, [loading, router, user]);

  return null;
}
