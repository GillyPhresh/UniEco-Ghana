'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, Home, MapPinned, ShoppingCart, Package, User } from 'lucide-react';
import { motion } from 'framer-motion';
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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-card/95 shadow-[0_-8px_24px_-18px_hsl(var(--foreground)/0.45)] backdrop-blur-xl lg:hidden"
      aria-label="Mobile bottom navigation"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex min-h-[4.5rem] max-w-xl items-stretch justify-around px-2 pb-1 pt-1">
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn('relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-colors', isActive ? 'bg-primary/10' : 'hover:bg-muted/70')}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-active"
                  className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon
                className={`h-5 w-5 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
              <span
                className={`truncate text-[10px] font-semibold transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
