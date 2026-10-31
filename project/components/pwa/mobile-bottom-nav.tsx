'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, Home, MapPinned, ShoppingCart, Package, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/marketplace', label: 'Shop', icon: ShoppingCart },
  { href: '/campus-mate', label: 'Mate', icon: MapPinned },
  { href: '/orders', label: 'Orders', icon: Package },
  { href: '/dashboard', label: 'Account', icon: User },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  // Don't show on admin or vendor dashboard — they have their own layouts
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/vendor-dashboard') ||
    pathname.startsWith('/signin') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/verify-email') ||
    pathname.startsWith('/payments') ||
    pathname.startsWith('/checkout')
  ) {
    return null;
  }

  // Adjust the last item based on auth state
  const items = user
    ? NAV_ITEMS
    : [
        { href: '/', label: 'Home', icon: Home },
        { href: '/marketplace', label: 'Shop', icon: ShoppingCart },
        { href: '/campus-mate', label: 'Mate', icon: MapPinned },
        { href: '/events', label: 'Events', icon: CalendarDays },
        { href: '/signin', label: 'Sign in', icon: User },
      ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-card/95 shadow-[0_-8px_24px_-18px_hsl(var(--foreground)/0.45)] backdrop-blur-xl lg:hidden"
      aria-label="Mobile bottom navigation"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid min-h-[4.25rem] max-w-xl grid-cols-5 items-stretch gap-1 px-2 pb-1 pt-1">
        {items.map((item) => {
          const isCurrent =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          const isActive = isCurrent || pendingHref === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              onClick={() => {
                if (!isCurrent) setPendingHref(item.href);
              }}
              className={cn(
                'relative flex min-h-[3.5rem] min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1 transition-colors active:scale-[0.97]',
                isActive ? 'bg-primary/[0.07]' : 'hover:bg-muted/70',
              )}
              aria-label={item.label}
              aria-current={isCurrent ? 'page' : undefined}
              aria-busy={pendingHref === item.href || undefined}
            >
              {isActive && (
                <span className="absolute top-1 h-1 w-6 rounded-full bg-primary" aria-hidden="true" />
              )}
              <span className={cn('flex h-8 w-10 items-center justify-center rounded-xl transition-colors', isActive ? 'text-primary' : 'text-muted-foreground')}>
                <Icon className="h-[21px] w-[21px]" strokeWidth={isActive ? 2.25 : 1.9} />
              </span>
              <span className={cn('max-w-full truncate text-[11px] font-semibold leading-none transition-colors', isActive ? 'text-primary' : 'text-muted-foreground')}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
