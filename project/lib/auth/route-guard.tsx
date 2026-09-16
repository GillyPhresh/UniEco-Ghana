'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import type { UserRole } from '@/lib/types';
import { Loader2 } from 'lucide-react';

interface RouteGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  allowedRoles?: UserRole[];
  redirectTo?: string;
}

export function RouteGuard({
  children,
  requireAuth = true,
  allowedRoles,
  redirectTo = '/signin',
}: RouteGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (requireAuth && !user) {
      const currentPath = window.location.pathname;
      router.replace(`${redirectTo}?next=${encodeURIComponent(currentPath)}`);
      return;
    }

    if (user && allowedRoles && !allowedRoles.includes(user.role)) {
      router.replace('/');
      return;
    }
  }, [user, loading, requireAuth, allowedRoles, router, redirectTo]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (requireAuth && !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
