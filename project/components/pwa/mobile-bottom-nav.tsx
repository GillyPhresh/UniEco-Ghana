'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, Home, MapPinned, ShoppingCart, Package, User } from 'lucide-react';
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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 backdrop-blur-xl lg:hidden"
      aria-label="Mobile bottom navigation"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid min-h-[3.75rem] max-w-xl grid-cols-5 items-stretch gap-1 px-2 pb-1 pt-1">
        {items.map((item) => {
          const isCurrent =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          const isActive = isCurrent;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={cn(
                'relative flex min-h-[3.25rem] min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors duration-100',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label={item.label}
              aria-current={isCurrent ? 'page' : undefined}
            >
              <span className={cn('flex h-9 w-10 items-center justify-center transition-colors', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                <Icon className="h-[23px] w-[23px]" strokeWidth={isActive ? 2.6 : 1.8} fill={isActive && item.href === '/' ? 'currentColor' : 'none'} />
              </span>
              <span className="sr-only">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
