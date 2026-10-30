import type { AuthUser } from '@/lib/types';
import { safeInternalPath, withNext } from '@/lib/auth/redirects';

export function registrationDestination(user: AuthUser, next: string | null | undefined) {
  const requested = safeInternalPath(next);
  const intent = user.profile?.preferences?.registration_intent;
  const isVendor = user.role === 'external_vendor'
    || user.role === 'student_vendor'
    || intent === 'external_vendor';
  return withNext(isVendor ? '/onboarding/vendor?payment_required=1' : '/onboarding/student?payment_required=1', requested);
}
